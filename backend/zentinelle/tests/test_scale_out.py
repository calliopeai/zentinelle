"""Scale-out readiness (#475): counters shared by every replica, worker drain,
and the task queue backlog the worker autoscaler reads.

The counter tests run many threads with fresh evaluator and store objects per
thread, which is what N backend processes look like to the cache: nothing in
process memory is shared, and every read races every other replica's write.
"""
import asyncio
import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache, caches
from django.test import SimpleTestCase, override_settings
from google.protobuf.duration_pb2 import Duration
from temporalio.api.enums.v1 import EventType
from temporalio.api.taskqueue.v1 import TaskQueueStats, TaskQueueStatus
from temporalio.api.workflowservice.v1 import DescribeTaskQueueResponse
from temporalio.testing import WorkflowEnvironment

from zentinelle.models import Policy
from zentinelle.services import prompt_tester
from zentinelle.services.evaluators.rate_limit import RateLimitEvaluator
from zentinelle.temporal.activities import as_activity
from zentinelle.temporal.backlog import (backlog_record, publish_backlog,
                                         task_queue_backlog)
from zentinelle.temporal.client import task_input
from zentinelle.temporal.registry import Retry, Task
from zentinelle.temporal.workflows import TaskWorkflow
from zentinelle.tests.test_audit_tenant_isolation import _real_session_state

# test_session_quota swaps the module for an in-memory stub at import.
SessionStateStore = _real_session_state().SessionStateStore

REPLICAS = 24


def all_at_once(fn, n=REPLICAS):
    """Run fn(i) on n threads released together, and return the results.

    Every plain cache read is held for a moment before it returns, so each
    thread has read before any has written: the interleaving N replicas hit
    under load, made certain. A read-modify-write counter loses every update
    but one; an atomic one never reads.
    """
    barrier = threading.Barrier(n)
    backend = type(caches['default'])
    read = backend.get

    def slow_read(self, *args, **kwargs):
        value = read(self, *args, **kwargs)
        time.sleep(0.2)
        return value

    def run(i):
        barrier.wait()
        return fn(i)

    with patch.object(backend, 'get', slow_read), ThreadPoolExecutor(max_workers=n) as pool:
        return list(pool.map(run, range(n)))


class SharedCounterTests(SimpleTestCase):

    def setUp(self):
        self.tenant = f'scale-{uuid.uuid4().hex}'

    def policy(self, config):
        return Policy(tenant_id=self.tenant, name='limit', policy_type=Policy.PolicyType.RATE_LIMIT,
                      scope_type=Policy.ScopeType.ORGANIZATION, config=config)

    def evaluate(self, policy, action='spawn', **context):
        return RateLimitEvaluator().evaluate(
            policy, action, None, {'_tenant_id': self.tenant, '_endpoint_id': 'agent', **context})

    def test_a_burst_across_replicas_admits_exactly_the_limit(self):
        policy = self.policy({'requests_per_minute': 5})

        passed = all_at_once(lambda _: self.evaluate(policy).passed)

        self.assertEqual(sum(passed), 5, 'replicas that read the same count each admitted a request')

    def test_the_daily_token_budget_is_reserved_not_read(self):
        policy = self.policy({'tokens_per_day': 1000})

        passed = all_at_once(lambda _: self.evaluate(policy, 'ai_request', tokens=300).passed)

        self.assertEqual(sum(passed), 3)
        # A refused request gives its reservation back.
        key = f'zentinelle:ratelimit:{self.tenant}:agent:tokens_daily'
        self.assertEqual(cache.get(key), 900)
        self.assertTrue(self.evaluate(policy, 'ai_request', tokens=100).passed)
        refused = self.evaluate(policy, 'ai_request', tokens=1)
        self.assertFalse(refused.passed)
        self.assertIn('Current: 1000', refused.message)

    def test_a_busy_day_still_ends(self):
        """Every request used to rewrite the counter with a fresh 24 hours."""
        policy = self.policy({'tokens_per_day': 1000})
        with patch.object(cache, 'set', wraps=cache.set) as rewrite:
            for _ in range(3):
                self.evaluate(policy, 'ai_request', tokens=10)
        rewrite.assert_not_called()

    def test_dry_runs_count_nothing(self):
        policy = self.policy({'requests_per_minute': 1, 'tokens_per_day': 10})
        for _ in range(3):
            self.assertTrue(RateLimitEvaluator().evaluate(
                policy, 'ai_request', None, {'_tenant_id': self.tenant, '_endpoint_id': 'agent', 'tokens': 10},
                dry_run=True).passed)
        self.assertTrue(self.evaluate(policy, 'ai_request', tokens=10).passed)
        self.assertFalse(self.evaluate(policy).passed)

    def test_session_counters_add_up_across_processes(self):
        session = uuid.uuid4().hex

        all_at_once(lambda _: SessionStateStore().increment(session, self.tenant, 'tool_calls', 2))

        self.assertEqual(SessionStateStore().get(session, self.tenant, 'tool_calls'), 2 * REPLICAS,
                         'increments made at the same time by other processes were lost')
        self.assertEqual(SessionStateStore().get_all(session, self.tenant), {'tool_calls': 2 * REPLICAS})
        SessionStateStore().reset(session, self.tenant)
        self.assertEqual(SessionStateStore().get_all(session, self.tenant), {})

    def test_session_counters_are_per_tenant(self):
        session = uuid.uuid4().hex
        SessionStateStore().increment(session, self.tenant, 'tool_calls')
        self.assertEqual(SessionStateStore().get_all(session, f'{self.tenant}-other'), {})

    def test_prompt_tester_limit_holds_across_replicas(self):
        user = uuid.uuid4().hex

        results = all_at_once(lambda _: prompt_tester.check_rate_limit(user, 'test', 5))

        self.assertEqual(sum(allowed for allowed, _ in results), 5)
        self.assertEqual(sorted(remaining for allowed, remaining in results if allowed), [0, 1, 2, 3, 4])


def describe_response(count=None, age_seconds=0, hint=None):
    if count is not None:
        return DescribeTaskQueueResponse(stats=TaskQueueStats(
            approximate_backlog_count=count, approximate_backlog_age=Duration(seconds=age_seconds)))
    return DescribeTaskQueueResponse(task_queue_status=TaskQueueStatus(backlog_count_hint=hint))


class FakeWorkflowService:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    async def describe_task_queue(self, request):
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def fake_client(*responses):
    return SimpleNamespace(namespace='zentinelle', workflow_service=FakeWorkflowService(*responses))


class BacklogTests(SimpleTestCase):

    def test_adds_workflow_and_activity_backlogs_and_takes_the_oldest_age(self):
        client = fake_client(describe_response(3, 40), describe_response(5, 7))

        self.assertEqual(asyncio.run(task_queue_backlog(client, 'zentinelle')), (8, 40.0))
        sent = client.workflow_service.requests
        self.assertEqual([r.task_queue.name for r in sent], ['zentinelle', 'zentinelle'])
        self.assertEqual({r.task_queue_type for r in sent}, {1, 2})
        self.assertTrue(all(r.report_stats and r.namespace == 'zentinelle' for r in sent))

    def test_an_older_server_without_stats_gives_its_count_hint(self):
        client = fake_client(describe_response(hint=4), describe_response(hint=2))

        self.assertEqual(asyncio.run(task_queue_backlog(client, 'zentinelle')), (6, 0.0))

    def test_the_record_is_embedded_metric_format_per_task_queue(self):
        record = backlog_record('Zentinelle/Temporal', 'zentinelle', 8, 40.0, 1_700_000_000.5)

        directive = record['_aws']['CloudWatchMetrics'][0]
        self.assertEqual(record['_aws']['Timestamp'], 1_700_000_000_500)
        self.assertEqual(directive['Namespace'], 'Zentinelle/Temporal')
        self.assertEqual(directive['Dimensions'], [['TaskQueue']])
        for metric in directive['Metrics']:
            self.assertIn(metric['Name'], record)
        self.assertEqual((record['TaskQueue'], record['ApproximateBacklogCount'],
                          record['ApproximateBacklogAgeSeconds']), ('zentinelle', 8, 40.0))

    def test_publishes_until_stopped_and_skips_a_failed_read(self):
        client = fake_client(RuntimeError('unavailable'), describe_response(hint=1),
                             describe_response(hint=2), describe_response(hint=3))
        lines = []

        async def go():
            stop = asyncio.Event()

            def write(line):
                lines.append(json.loads(line))
                stop.set()

            await asyncio.wait_for(publish_backlog(client, 'zentinelle', 'Zentinelle/Temporal', 0.01, stop, write), 5)

        with self.assertLogs('zentinelle.temporal.backlog', 'WARNING'):
            asyncio.run(go())
        # The failed read wrote nothing rather than a zero that would scale in.
        self.assertEqual([line['ApproximateBacklogCount'] for line in lines], [3])

    def test_reads_a_real_servers_backlog(self):
        async def go():
            async with await WorkflowEnvironment.start_local() as env:
                queue = f'backlog-{uuid.uuid4()}'
                noop = Task(lambda: None, 'test.backlog', Retry())
                for _ in range(3):
                    await env.client.start_workflow(TaskWorkflow.run, task_input(noop), id=f'b-{uuid.uuid4()}',
                                                    task_queue=queue)
                # Stats are approximate and catch up within a few seconds.
                for _ in range(50):
                    count, _age = await task_queue_backlog(env.client, queue)
                    if count >= 3:
                        return count
                    await asyncio.sleep(0.2)
                return count

        self.assertEqual(asyncio.run(go()), 3)


class WorkerDrainTests(SimpleTestCase):

    @override_settings(TEMPORAL_WORKER_DRAIN_SECONDS=10)
    def test_a_running_activity_finishes_when_the_worker_is_stopped(self):
        from zentinelle.management.commands import temporal_worker

        started, release = threading.Event(), threading.Event()

        def slow():
            started.set()
            release.wait(5)
            return 'finished'

        registered = Task(slow, 'test.drain', Retry())
        queue = f'drain-{uuid.uuid4()}'

        async def go():
            async with await WorkflowEnvironment.start_local() as env:
                with ThreadPoolExecutor(max_workers=4) as executor, \
                        override_settings(TEMPORAL_TASK_QUEUE=queue), \
                        patch.object(temporal_worker, 'build_activities', lambda: [as_activity(registered)]):
                    worker = temporal_worker.build_worker(env.client, executor)
                    self.assertEqual(worker.config()['graceful_shutdown_timeout'], timedelta(seconds=10))
                    running = asyncio.create_task(worker.run())
                    handle = await env.client.start_workflow(
                        TaskWorkflow.run, task_input(registered), id=f'd-{uuid.uuid4()}', task_queue=queue)
                    await asyncio.get_running_loop().run_in_executor(None, started.wait, 5)
                    # SIGTERM: the worker shuts down while the activity runs.
                    shutdown = asyncio.create_task(worker.shutdown())
                    await asyncio.sleep(0.3)
                    release.set()
                    await shutdown
                    await running
                return [event.event_type async for event in handle.fetch_history_events()]

        events = asyncio.run(go())
        self.assertIn(EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED, events,
                      'the activity was cut short by the shutdown instead of finishing')
