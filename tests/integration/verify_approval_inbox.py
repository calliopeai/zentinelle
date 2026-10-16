"""Exercise the production portal against a deterministic human-session API fixture.

Run after `cd frontend && npm ci && npm run build` with Playwright + Chromium
installed. The real held-action authorization contract is separately covered by
backend/zentinelle/tests/test_agent_host.py; this test covers the browser boundary.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
API = '/api/zentinelle/v1'
FIRST = '10000000-0000-4000-8000-000000000001'
SECOND = '10000000-0000-4000-8000-000000000002'


def user(cookie):
    viewer = 'viewer' in cookie
    return {'id': '1', 'username': 'viewer' if viewer else 'operator',
            'email': 'test@example.invalid', 'is_staff': False, 'is_superuser': False,
            'role': 'viewer' if viewer else 'operator',
            'capabilities': ['view'] if viewer else ['view', 'mutate']}


class SessionAPI(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({'user': user(self.headers.get('Cookie', ''))}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def row(request_id=FIRST, age=0, expires=240, arguments=False):
    now = datetime.now(timezone.utc)
    context = {'harness': 'calliope', 'session_id': 'cykick-session', 'tool_name': 'Bash'}
    if arguments:
        context['tool_input'] = {'command': '<script>alert("must remain text")</script>'}
    return {'request_id': request_id, 'agent_id': 'cykick-host', 'user_id': 'operator',
            'action': 'tool_call', 'context': context, 'reason': 'Human review required',
            'trace_id': 'trace-test', 'created_at': (now - timedelta(seconds=age)).isoformat(),
            'expires_at': (now + timedelta(seconds=expires)).isoformat()}


def main():
    api = ThreadingHTTPServer(('127.0.0.1', 0), SessionAPI)
    threading.Thread(target=api.serve_forever, daemon=True).start()
    with socket.socket() as allocation:
        allocation.bind(('127.0.0.1', 0))
        port = allocation.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    env = {**os.environ, 'AUTH_MODE': 'local', 'NEXT_PUBLIC_AUTH_MODE': 'local',
           'INTERNAL_API_URL': f'http://127.0.0.1:{api.server_port}{API}',
           'NEXT_TELEMETRY_DISABLED': '1'}
    with tempfile.TemporaryFile(mode='w+') as log:
        server = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start',
                                   '--hostname', '127.0.0.1', '--port', str(port)],
                                  cwd=ROOT / 'frontend', env=env, stdout=log, stderr=log)
        try:
            for _ in range(120):
                if server.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(log.read())
                try:
                    urlopen(origin + '/auth/login', timeout=1).close()
                    break
                except OSError:
                    time.sleep(0.25)
            else:
                raise RuntimeError('Portal failed to start')
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                try:
                    for role in ('operator', 'viewer'):
                        context = browser.new_context(viewport={'width': 1280, 'height': 1000})
                        context.add_cookies([{'name': 'sessionid', 'value': role, 'url': origin}])
                        page = context.new_page()
                        errors = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        state = {'rows': [row(SECOND, age=60), row()], 'failure': False,
                                 'decision_status': 200, 'posts': [], 'reads': 0}

                        def route_api(route):
                            path = route.request.url.split(origin)[-1]
                            if path.endswith('/auth/me'):
                                body = {'user': user(role)}
                            elif path.endswith('/auth/csrf'):
                                body = {'csrf_token': 'masked-fixture-csrf'}
                            elif path.endswith('/approvals/requests'):
                                state['reads'] += 1
                                if state['failure']:
                                    route.fulfill(status=503, json={'error': 'fixture unavailable'})
                                    return
                                body = {'requests': state['rows']}
                            elif path.endswith('/decision'):
                                assert role == 'operator', 'Viewer attempted a decision'
                                assert route.request.headers['x-csrftoken'] == 'masked-fixture-csrf'
                                assert 'sessionid=operator' in route.request.headers.get('cookie', '')
                                assert 'x-zentinelle-key' not in route.request.headers
                                payload = route.request.post_data_json
                                request_id = path.split('/')[-2]
                                state['posts'].append((request_id, payload))
                                if state['decision_status'] != 200:
                                    route.fulfill(status=state['decision_status'], json={'error': 'Already decided'})
                                    return
                                state['rows'] = [item for item in state['rows'] if item['request_id'] != request_id]
                                body = {'request_id': request_id, 'status': 'approved' if payload['decision'] == 'approve' else 'denied'}
                            else:
                                body = {}
                            route.fulfill(json=body)

                        page.route(f'{origin}{API}/**', route_api)
                        page.route('**/graphql*', lambda route: route.fulfill(json={'data': {'notifications': [], 'complianceAlerts': []}}))
                        page.goto(origin + '/approvals')
                        expect(page.get_by_role('heading', name='Approvals', exact=True)).to_be_visible()
                        cards = page.locator('[aria-label^="Request "]')
                        expect(cards).to_have_count(2)
                        expect(cards.first).to_have_attribute('aria-label', f'Request {FIRST}')
                        cards.first.get_by_text('Action details', exact=True).click()
                        expect(cards.first.get_by_text('Metadata-only capture', exact=False)).to_be_visible()
                        expect(cards.first.get_by_role('link', name='content capture settings')).to_have_attribute('href', '/settings')
                        if os.environ.get('APPROVAL_SCREENSHOTS'):
                            page.screenshot(path=f"{os.environ['APPROVAL_SCREENSHOTS']}/{role}.png", full_page=True)
                        if role == 'viewer':
                            expect(page.get_by_text('You have view-only access.', exact=False)).to_be_visible()
                            expect(page.get_by_role('button', name='Approve', exact=True)).to_have_count(0)
                            expect(page.get_by_role('button', name='Deny', exact=True)).to_have_count(0)
                            assert not state['posts']
                        else:
                            cards.first.get_by_label('Decision reason (optional)').fill('Expected test run')
                            cards.first.get_by_role('button', name='Approve', exact=True).click()
                            expect(cards).to_have_count(1)
                            assert state['posts'] == [(FIRST, {'decision': 'approve', 'reason': 'Expected test run'})]
                            cards.first.get_by_role('button', name='Deny', exact=True).click()
                            expect(page.get_by_text('No pending approvals', exact=True)).to_be_visible()
                            assert state['posts'][-1] == (SECOND, {'decision': 'deny', 'reason': ''})

                            state['rows'] = [row(arguments=True)]
                            page.get_by_role('button', name='Refresh', exact=True).click()
                            expect(cards).to_have_count(1)
                            cards.first.get_by_text('Action details', exact=True).click()
                            expect(cards.first.locator('pre')).to_contain_text('<script>')
                            assert page.locator('main script').count() == 0
                            page.set_viewport_size({'width': 390, 'height': 844})
                            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Narrow layout overflow'
                            if os.environ.get('APPROVAL_SCREENSHOTS'):
                                page.screenshot(path=f"{os.environ['APPROVAL_SCREENSHOTS']}/narrow.png", full_page=True)
                            page.set_viewport_size({'width': 1280, 'height': 1000})

                            state['failure'] = True
                            page.get_by_role('button', name='Refresh', exact=True).click()
                            expect(page.locator('main').get_by_role('alert')).to_contain_text('could not be refreshed')
                            expect(cards).to_have_count(0)
                            state['failure'] = False
                            page.get_by_role('button', name='Refresh', exact=True).click()
                            expect(cards).to_have_count(1)
                            state['decision_status'] = 409
                            cards.first.get_by_role('button', name='Approve', exact=True).click()
                            expect(page.locator('main').get_by_role('alert')).to_contain_text('already decided')
                            expect(cards).to_have_count(0)
                            assert len(state['posts']) == 3, 'Failed decision retried automatically'

                            state['rows'] = [row(expires=2)]
                            page.get_by_role('button', name='Refresh', exact=True).click()
                            expect(cards).to_have_count(1)
                            expect(cards.first.get_by_role('button', name='Approve', exact=True)).to_be_disabled(timeout=5000)
                            expect(cards.first.get_by_text('Expired', exact=True)).to_be_visible()
                            state['rows'] = []
                            reads = state['reads']
                            expect(page.get_by_text('No pending approvals', exact=True)).to_be_visible(timeout=20000)
                            assert state['reads'] > reads, 'Inbox did not refresh automatically'
                            state['rows'] = [{**row(), 'request_id': '../wrong-request'}]
                            page.get_by_role('button', name='Refresh', exact=True).click()
                            expect(page.locator('main').get_by_role('alert')).to_contain_text('response was invalid')
                            expect(cards).to_have_count(0)
                        assert not errors, errors
                        context.close()
                        print(f'{role}: approval inbox browser checks passed')
                finally:
                    browser.close()
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
            api.shutdown()
            api.server_close()


if __name__ == '__main__':
    main()
