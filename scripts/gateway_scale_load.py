#!/usr/bin/env python3
"""Local scale-out proof for the Go gateway (#475). Never touches a real install.

Builds the gateway with its upstream pointed at a stub, then runs gateway
replicas on loopback against one stub process that plays both Zentinelle
(policy, provider-key lookup, usage events with deduplication by event ID) and
the provider (OpenAI chat completions, streamed and not). The script is the
load balancer: like an ALB it sends only to replicas whose /ready answers 200,
checking every quarter second.

Timeline under constant load: two replicas, a third joins (scale-out), the
first gets SIGTERM while streams are in flight (scale-in), load stops. The
stub answers some usage reports with a 503 after storing them, as a lost
answer would look, so the gateway's retries are exercised too.

Passes when no request failed, every replica served traffic, the drained
replica finished the streams it held and exited cleanly, and every successful
request's usage was recorded exactly once.

    python3 scripts/gateway_scale_load.py [--clients 16] [--phase 4]

Needs Go and Python 3.9+; stdlib only.
"""
import argparse
import http.client
import json
import os
import random
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDENTIAL = 'sk_gateway_' + 'loadtest' * 4
STREAM_CHUNKS, CHUNK_SECONDS = 8, 0.1


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Stub:
    """Zentinelle and the provider, in one server."""

    def __init__(self):
        self.lock = threading.Lock()
        self.events = {}          # event_id -> request_id
        self.duplicates = 0
        self.lost_answers = 0
        stub = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def log_message(self, *args):
                pass

            def reply(self, status, payload):
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
                if self.path == '/api/zentinelle/v1/evaluate':
                    return self.reply(200, {'allowed': True, 'decision': 'allow'})
                if self.path == '/api/zentinelle/v1/gateway/provider-key':
                    return self.reply(200, {'api_key': 'sk-stub-provider'})
                if self.path == '/api/zentinelle/v1/events':
                    return self.reply(*stub.record(json.loads(body)))
                if self.path == '/v1/chat/completions':
                    return self.completion(json.loads(body))
                self.reply(404, {'error': 'not_found'})

            def completion(self, request):
                usage = {'prompt_tokens': 11, 'completion_tokens': STREAM_CHUNKS, 'total_tokens': 11 + STREAM_CHUNKS}
                if not request.get('stream'):
                    time.sleep(0.05)
                    return self.reply(200, {'id': 'c', 'choices': [{'message': {'content': 'ok'}}], 'usage': usage})
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Transfer-Encoding', 'chunked')
                self.end_headers()

                def chunk(data):
                    line = f'data: {data}\n\n'.encode()
                    self.wfile.write(b'%x\r\n%s\r\n' % (len(line), line))
                    self.wfile.flush()

                for i in range(STREAM_CHUNKS):
                    chunk(json.dumps({'choices': [{'delta': {'content': str(i)}}]}))
                    time.sleep(CHUNK_SECONDS)
                chunk(json.dumps({'choices': [], 'usage': usage}))
                chunk('[DONE]')
                self.wfile.write(b'0\r\n\r\n')

        self.server = ThreadingHTTPServer(('127.0.0.1', free_port()), Handler)
        self.server.daemon_threads = True
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def record(self, batch):
        """Store each event once, as the backend's unique event ID does."""
        lose = False
        with self.lock:
            for event in batch.get('events', []):
                event_id = event.get('event_id')
                if event_id in self.events:
                    self.duplicates += 1
                    continue
                self.events[event_id] = event['payload']['request_id']
                # Every seventh new event: stored, but the answer is lost.
                if len(self.events) % 7 == 0:
                    lose = True
                    self.lost_answers += 1
        return (503, {'error': 'lost'}) if lose else (202, {'accepted': True})


class Replica:
    def __init__(self, name, binary, stub_url, logdir):
        self.name, self.port = name, free_port()
        self.url = f'127.0.0.1:{self.port}'
        self.log_path = os.path.join(logdir, f'{name}.log')
        env = {
            'PATH': os.environ.get('PATH', ''),
            'GATEWAY_PORT': str(self.port),
            'ZENTINELLE_URL': stub_url,
            'ZENTINELLE_GATEWAY_CREDENTIAL': CREDENTIAL,
            'HEARTBEAT_INTERVAL_SECONDS': '0',
            'SHUTDOWN_DELAY_SECONDS': '2',
            'DRAIN_TIMEOUT_SECONDS': '20',
        }
        self.log = open(self.log_path, 'w')
        self.proc = subprocess.Popen([binary], env=env, stdout=self.log, stderr=subprocess.STDOUT)
        self.sigterm_at = None

    def ready(self):
        try:
            conn = http.client.HTTPConnection(self.url, timeout=1)
            conn.request('GET', '/ready')
            ok = conn.getresponse().status == 200
            conn.close()
            return ok
        except OSError:
            return False

    def in_flight(self):
        try:
            conn = http.client.HTTPConnection(self.url, timeout=1)
            conn.request('GET', '/metrics')
            text = conn.getresponse().read().decode()
            conn.close()
        except OSError:
            return None
        for line in text.splitlines():
            if line.startswith('zentinelle_gateway_active_connections '):
                return int(line.split()[1])
        return None

    def terminate(self):
        self.sigterm_at = time.monotonic()
        self.proc.send_signal(signal.SIGTERM)

    def stopped_line(self):
        with open(self.log_path) as f:
            for line in f:
                if '"gateway stopped"' in line:
                    return json.loads(line)
        return None


class Balancer:
    """Round-robin over the replicas whose /ready said 200 last time."""

    def __init__(self):
        self.replicas, self.ready = [], []
        self.lock, self.turn = threading.Lock(), 0
        self.stop = threading.Event()
        threading.Thread(target=self.poll, daemon=True).start()

    def add(self, replica):
        with self.lock:
            self.replicas.append(replica)

    def poll(self):
        while not self.stop.is_set():
            with self.lock:
                replicas = list(self.replicas)
            ready = [r for r in replicas if r.proc.poll() is None and r.ready()]
            with self.lock:
                self.ready = ready
            time.sleep(0.25)

    def pick(self):
        with self.lock:
            if not self.ready:
                return None
            self.turn += 1
            return self.ready[self.turn % len(self.ready)]


def one_request(replica, stream):
    body = json.dumps({'model': 'gpt-4o-mini', 'stream': stream,
                       'messages': [{'role': 'user', 'content': 'hello'}]})
    conn = http.client.HTTPConnection(replica.url, timeout=30)
    try:
        conn.request('POST', '/v1/chat/completions', body=body, headers={
            'X-Zentinelle-Key': 'sk_agent_loadtest', 'Content-Type': 'application/json'})
        resp = conn.getresponse()
        data = resp.read().decode()
        ok = resp.status == 200 and ('[DONE]' in data if stream else '"usage"' in data)
        return ok, resp.getheader('X-Request-ID'), None if ok else f'{resp.status} {data[:120]}'
    except (OSError, http.client.HTTPException) as e:
        return False, None, repr(e)
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--clients', type=int, default=16, help='concurrent clients')
    parser.add_argument('--phase', type=float, default=4.0, help='seconds per phase')
    args = parser.parse_args()

    workdir = tempfile.mkdtemp(prefix='gateway-scale-')
    stub = Stub()
    binary = os.path.join(workdir, 'gateway')
    subprocess.run(['go', 'build', '-ldflags', f'-X main.upstreamOverride={stub.url}', '-o', binary, '.'],
                   cwd=os.path.join(ROOT, 'gateway'), check=True)

    balancer = Balancer()
    replicas = {}

    def start(name):
        replica = Replica(name, binary, stub.url, workdir)
        replicas[name] = replica
        deadline = time.monotonic() + 10
        while not replica.ready():
            if time.monotonic() > deadline:
                sys.exit(f'{name} never became ready; see {replica.log_path}')
            time.sleep(0.05)
        balancer.add(replica)
        time.sleep(0.3)  # one poll, as a load balancer's health check would take

    start('a')
    start('b')

    results, results_lock, load_done = [], threading.Lock(), threading.Event()

    def client():
        while not load_done.is_set():
            replica = balancer.pick()
            if replica is None:
                time.sleep(0.01)
                continue
            stream = random.random() < 0.5
            began = time.monotonic()
            ok, request_id, error = one_request(replica, stream)
            with results_lock:
                results.append({'replica': replica.name, 'ok': ok, 'request_id': request_id, 'error': error,
                                'stream': stream, 'began': began, 'ended': time.monotonic()})

    threads = [threading.Thread(target=client, daemon=True) for _ in range(args.clients)]
    t0 = time.monotonic()
    for t in threads:
        t.start()

    time.sleep(args.phase)
    scale_out_at = time.monotonic()
    start('c')
    time.sleep(args.phase / 2)
    in_flight_before = {name: r.in_flight() for name, r in replicas.items()}
    time.sleep(args.phase / 2)
    replicas['a'].terminate()
    time.sleep(args.phase)
    load_done.set()
    for t in threads:
        t.join()
    load_seconds = time.monotonic() - t0

    exit_a = replicas['a'].proc.wait(timeout=40)

    # Usage reports land asynchronously; wait for the last of them.
    ok_ids = {r['request_id'] for r in results if r['ok']}
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        with stub.lock:
            if len(stub.events) >= len(ok_ids):
                break
        time.sleep(0.1)

    for name in ('b', 'c'):
        replicas[name].terminate()
    exits = {'a': exit_a, **{n: replicas[n].proc.wait(timeout=40) for n in ('b', 'c')}}
    balancer.stop.set()
    stub.server.shutdown()

    a = replicas['a']
    failures = [r for r in results if not r['ok']]
    served = {name: sum(1 for r in results if r['replica'] == name) for name in replicas}
    held_at_sigterm = [r for r in results if r['replica'] == 'a' and r['began'] < a.sigterm_at < r['ended']]
    sent_to_a_late = [r for r in results if r['replica'] == 'a' and r['began'] > a.sigterm_at + 2.5]
    c_early = [r for r in results if r['replica'] == 'c' and r['began'] < scale_out_at]
    recorded = list(stub.events.values())
    stopped = a.stopped_line() or {}

    checks = [
        ('no request failed', not failures, f'{len(failures)} of {len(results)} failed'),
        ('every replica served traffic', all(served.values()), str(served)),
        ('the new replica took traffic only after it joined', not c_early, f'{len(c_early)} early'),
        ('the drained replica held requests at SIGTERM and finished them',
         held_at_sigterm and all(r['ok'] for r in held_at_sigterm),
         f"{len(held_at_sigterm)} held, {sum(1 for r in held_at_sigterm if r['stream'])} of them streams"),
        ('nothing reached the drained replica after its listener closed', not sent_to_a_late, f'{len(sent_to_a_late)} late'),
        ('the drained replica exited cleanly', exit_a == 0 and stopped.get('clean') is True,
         f"exit {exit_a}, clean={stopped.get('clean')}"),
        ('every request metered exactly once',
         len(recorded) == len(set(recorded)) and set(recorded) == ok_ids,
         f'{len(ok_ids)} requests, {len(recorded)} usage events, {len(set(recorded))} distinct request ids'),
        ('lost answers were retried and deduplicated', stub.duplicates >= stub.lost_answers > 0,
         f'{stub.lost_answers} lost answers, {stub.duplicates} duplicates dropped'),
    ]

    print(f'\nGateway scale-out load test: {args.clients} clients, {load_seconds:.1f}s, '
          f'{len(results)} requests ({len(results) / load_seconds:.0f}/s), half streamed')
    print(f'requests per replica: {served}; in flight mid-run: {in_flight_before}; exit codes: {exits}')
    width = max(len(name) for name, _, _ in checks)
    for name, passed, detail in checks:
        print(f"  {'PASS' if passed else 'FAIL'}  {name.ljust(width)}  {detail}")
    for r in failures[:5]:
        print(f"  failed: replica {r['replica']}: {r['error']}")
    print(f'logs: {workdir}')
    return 0 if all(passed for _, passed, _ in checks) else 1


if __name__ == '__main__':
    sys.exit(main())
