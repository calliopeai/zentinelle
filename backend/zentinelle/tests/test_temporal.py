"""Temporal wiring: the task registry, the generic workflow, schedules, enqueue.

Workflow tests run in temporalio's time-skipping test environment, so CI needs
no Temporal server and retry backoff costs no wall-clock time.
"""
import asyncio
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from temporalio.client import (ScheduleAlreadyRunningError,
                               ScheduleOverlapPolicy, ScheduleState,
                               ScheduleUpdateInput)
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError, RPCStatusCode
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from zentinelle.temporal import client as temporal_client
from zentinelle.temporal.activities import as_activity, load_tasks
from zentinelle.temporal.client import (TemporalUnavailable, start_task,
                                        task_input)
from zentinelle.temporal.registry import Retry, Task, task
from zentinelle.temporal.schedules import SCHEDULE_PREFIX, sync_schedules
from zentinelle.temporal.workflows import TaskWorkflow


class RegistryTests(SimpleTestCase):

    def test_retry_delay_maps_to_even_spacing(self):
        @task(name=f'test.even.{uuid.uuid4()}', retries=3, retry_delay=60)
        def even():
            pass

        self.assertEqual(even.retry, Retry(4, 60.0, 1.0, None))

    def test_autoretry_maps_to_exponential_backoff(self):
        @task(name=f'test.backoff.{uuid.uuid4()}', retries=5)
        def backoff():
            pass

        self.assertEqual(backoff.retry, Retry(6, 1.0, 2.0, 600.0))

    def test_plain_task_runs_once_and_is_callable_inline(self):
        @task(name=f'test.plain.{uuid.uuid4()}')
        def plain(a, b=2):
            return a + b

        self.assertEqual(plain.retry.max_attempts, 1)
        self.assertEqual(plain(1, b=3), 4)

    def test_default_name_matches_celery_naming(self):
        from zentinelle.tasks.events import process_event_batch

        self.assertEqual(process_event_batch.name, 'zentinelle.tasks.events.process_event_batch')


class ScheduleDeclarationTests(SimpleTestCase):

    def test_every_schedule_names_a_registered_task(self):
        tasks = load_tasks()
        for schedule_id, entry in settings.TEMPORAL_SCHEDULES.items():
            self.assertTrue(schedule_id.startswith(SCHEDULE_PREFIX), schedule_id)
            self.assertIn(entry['task'], tasks, schedule_id)
            self.assertEqual(len({'every', 'cron'} & entry.keys()), 1, schedule_id)

    def test_the_beat_schedule_carried_over_whole(self):
        """Same jobs and cadence as the Celery beat schedule this replaced,
        plus the event retry sweep beat never ran."""
        expected = {
            'zentinelle-dispatch-event-outbox': ('zentinelle.tasks.events.dispatch_event_outbox', timedelta(minutes=1)),
            'zentinelle-retry-failed-events': ('zentinelle.tasks.scheduled.retry_failed_events', timedelta(minutes=5)),
            'zentinelle-enforce-retention-policies': ('zentinelle.enforce_retention_policies', '0 1 * * *'),
            'zentinelle-sync-model-registry': ('zentinelle.sync_model_registry', '0 5 * * *'),
            'zentinelle-cleanup-old-events': ('zentinelle.tasks.scheduled.cleanup_old_events', '0 4 * * 0'),
            'zentinelle-check-endpoint-health': ('zentinelle.tasks.scheduled.check_endpoint_health', timedelta(minutes=15)),
            'zentinelle-send-usage-to-stripe': ('zentinelle.tasks.billing.send_usage_to_stripe', '0 * * * *'),
            'zentinelle-export-usage-to-billing': ('zentinelle.tasks.billing.export_usage_to_billing', timedelta(minutes=15)),
            'zentinelle-detect-license-violations': (
                'zentinelle.tasks.license_compliance.detect_license_violations_all_orgs', '0 2 * * *'),
            'zentinelle-auto-resolve-violations': (
                'zentinelle.tasks.license_compliance.auto_resolve_violations', '0 */6 * * *'),
            'zentinelle-weekly-compliance-summaries': (
                'zentinelle.tasks.license_compliance.generate_weekly_compliance_summaries', '0 6 * * 1'),
            'zentinelle-monthly-compliance-reports': (
                'zentinelle.tasks.license_compliance.generate_monthly_compliance_reports', '0 3 1 * *'),
            'zentinelle-check-compliance-drift': (
                'zentinelle.tasks.compliance_monitoring.check_compliance_drift', timedelta(hours=1)),
            'zentinelle-monitor-violation-rates': (
                'zentinelle.tasks.compliance_monitoring.monitor_violation_rates', timedelta(minutes=30)),
            'zentinelle-check-policy-health': (
                'zentinelle.tasks.compliance_monitoring.check_policy_health', timedelta(hours=6)),
            'zentinelle-detect-usage-anomalies': (
                'zentinelle.tasks.compliance_monitoring.detect_usage_anomalies', timedelta(hours=1)),
        }
        actual = {
            key: (entry['task'], entry.get('every', entry.get('cron')))
            for key, entry in settings.TEMPORAL_SCHEDULES.items()
        }
        self.assertEqual(actual, expected)


class FakeHandle:
    def __init__(self, calls, schedule_id, gone=()):
        self.calls, self.schedule_id, self.gone = calls, schedule_id, gone

    async def update(self, updater):
        # The real updater input: the live schedule is under `.description`.
        current = ScheduleUpdateInput(description=SimpleNamespace(schedule=SimpleNamespace(
            state=ScheduleState(paused=True, note='paused by an operator'))))
        self.calls.append(('update', self.schedule_id, updater(current).schedule))

    async def delete(self):
        self.calls.append(('delete', self.schedule_id))
        if self.schedule_id in self.gone:
            raise RPCError('schedule not found', RPCStatusCode.NOT_FOUND, b'')


class FakeListed:
    def __init__(self, schedule_id):
        self.id = schedule_id


class FakeClient:
    """Enough of temporalio.client.Client for sync_schedules."""

    def __init__(self, existing, gone=()):
        self.existing = existing
        self.gone = gone
        self.calls = []

    async def create_schedule(self, schedule_id, schedule):
        if schedule_id in self.existing:
            raise ScheduleAlreadyRunningError()
        self.calls.append(('create', schedule_id, schedule))

    def get_schedule_handle(self, schedule_id):
        return FakeHandle(self.calls, schedule_id, self.gone)

    async def list_schedules(self):
        async def listing():
            for schedule_id in self.existing:
                yield FakeListed(schedule_id)
        return listing()


@override_settings(TEMPORAL_SCHEDULES={
    'zentinelle-new': {'task': 'zentinelle.tasks.events.dispatch_event_outbox', 'every': timedelta(minutes=1)},
    'zentinelle-kept': {'task': 'zentinelle.enforce_retention_policies', 'cron': '0 1 * * *'},
})
class SyncSchedulesTests(SimpleTestCase):

    def test_creates_updates_and_prunes_without_duplicating(self):
        client = FakeClient(existing=['zentinelle-kept', 'zentinelle-retired', 'other-app-job'])
        asyncio.run(sync_schedules(client, load_tasks()))

        kinds = [(call[0], call[1]) for call in client.calls]
        self.assertIn(('create', 'zentinelle-new'), kinds)
        self.assertIn(('update', 'zentinelle-kept'), kinds)
        self.assertIn(('delete', 'zentinelle-retired'), kinds)
        # Another app's schedule on a shared server is never touched.
        self.assertNotIn(('delete', 'other-app-job'), kinds)
        self.assertNotIn(('create', 'zentinelle-kept'), kinds)

        created = next(call[2] for call in client.calls if call[1] == 'zentinelle-new')
        self.assertEqual(created.spec.intervals[0].every, timedelta(minutes=1))
        updated = next(call[2] for call in client.calls if call[1] == 'zentinelle-kept')
        self.assertEqual(updated.spec.cron_expressions, ['0 1 * * *'])
        # A pause set in the Temporal UI survives the redeploy.
        self.assertTrue(updated.state.paused)
        self.assertEqual(updated.state.note, 'paused by an operator')
        # Missed slots are skipped the way beat skipped them, not backfilled.
        self.assertEqual(created.policy.overlap, ScheduleOverlapPolicy.SKIP)
        self.assertEqual(created.policy.catchup_window, timedelta(minutes=1))

    def test_a_schedule_another_worker_already_deleted_is_not_an_error(self):
        client = FakeClient(existing=['zentinelle-retired'], gone=['zentinelle-retired'])
        asyncio.run(sync_schedules(client, load_tasks()))
        self.assertIn(('delete', 'zentinelle-retired'), [call[:2] for call in client.calls])

    def test_restarts_against_a_real_server_are_idempotent(self):
        """#437: the second worker start found every schedule present, took the
        update path and crashed. Sync three times against a real dev server
        (first start, restart, restart after an operator pause)."""
        async def go():
            async with await WorkflowEnvironment.start_local() as env:
                tasks = load_tasks()
                await sync_schedules(env.client, tasks)
                await sync_schedules(env.client, tasks)
                await env.client.get_schedule_handle('zentinelle-kept').pause(note='paused by an operator')
                await sync_schedules(env.client, tasks)
                # The listing goes through visibility and is eventually
                # consistent, so poll it the way temporalio's own tests do.
                expected = ['zentinelle-kept', 'zentinelle-new']
                for _ in range(50):
                    ids = sorted([listed.id async for listed in await env.client.list_schedules()])
                    if ids == expected:
                        break
                    await asyncio.sleep(0.2)
                kept = await env.client.get_schedule_handle('zentinelle-kept').describe()
                return ids, kept
        ids, kept = asyncio.run(go())
        self.assertEqual(ids, ['zentinelle-kept', 'zentinelle-new'])
        # The server stores cron as calendars: 01:00 daily.
        self.assertEqual([c.hour[0].start for c in kept.schedule.spec.calendars], [1])
        self.assertTrue(kept.schedule.state.paused)
        self.assertEqual(kept.schedule.state.note, 'paused by an operator')


class StartTaskTests(SimpleTestCase):

    def test_empty_address_starts_nothing(self):
        with patch.object(temporal_client, '_start') as start:
            workflow_id = start_task(Task(lambda: None, 'test.noop', Retry()), workflow_id='k')
        start.assert_not_called()
        self.assertEqual(workflow_id, 'test.noop:k')

    @override_settings(TEMPORAL_ADDRESS='temporal.invalid:7233')
    def test_already_running_is_not_an_error(self):
        async def already_started(*args):
            raise WorkflowAlreadyStartedError('test.dup:k', 'ZentinelleTask')

        with patch.object(temporal_client, '_start', already_started):
            workflow_id = start_task(Task(lambda: None, 'test.dup', Retry()), workflow_id='k')
        self.assertEqual(workflow_id, 'test.dup:k')

    @override_settings(TEMPORAL_ADDRESS='temporal.invalid:7233')
    def test_fails_fast_while_temporal_is_unavailable(self):
        noop = Task(lambda: None, 'test.down', Retry())
        with patch.object(temporal_client, '_unavailable_until', time.monotonic() + 30), \
                patch.object(temporal_client, '_start') as start:
            with self.assertRaises(TemporalUnavailable):
                start_task(noop)
            # Hot paths never wait and never raise.
            start_task(noop, wait=False)
        start.assert_not_called()

    @override_settings(TEMPORAL_ADDRESS='temporal.invalid:7233')
    def test_failed_start_marks_temporal_unavailable(self):
        async def broken_connect():
            raise RuntimeError('connection refused')

        with patch.object(temporal_client, 'connect', broken_connect), \
                patch.object(temporal_client, '_client', None), \
                patch.object(temporal_client, '_unavailable_until', 0.0):
            with self.assertRaises(RuntimeError):
                start_task(Task(lambda: None, 'test.refused', Retry()))
            self.assertGreater(temporal_client._unavailable_until, time.monotonic())


class TaskWorkflowTests(SimpleTestCase):

    def run_task(self, registered, *args, **kwargs):
        async def go():
            async with await WorkflowEnvironment.start_time_skipping() as env:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    async with Worker(
                        env.client,
                        task_queue='test',
                        workflows=[TaskWorkflow],
                        activities=[as_activity(registered)],
                        activity_executor=executor,
                    ):
                        return await env.client.execute_workflow(
                            TaskWorkflow.run,
                            task_input(registered, args, kwargs),
                            id=f'test-{uuid.uuid4()}',
                            task_queue='test',
                        )
        return asyncio.run(go())

    def test_runs_the_task_with_args_and_kwargs(self):
        from decimal import Decimal

        def add(a, b=0):
            return {'sum': Decimal(a + b)}

        result = self.run_task(Task(add, 'test.add', Retry()), 2, b=3)
        self.assertEqual(result, {'sum': '5'})

    def test_retries_on_the_declared_policy(self):
        attempts = []

        def flaky():
            attempts.append(1)
            if len(attempts) < 3:
                raise RuntimeError('not yet')
            return len(attempts)

        # Even 60s spacing, as `retries=3, retry_delay=60` declares; the
        # time-skipping server makes the wait free.
        result = self.run_task(Task(flaky, 'test.flaky', Retry(4, 60.0, 1.0, None)))
        self.assertEqual(result, 3)

    def test_long_tasks_heartbeat_from_a_side_thread(self):
        from temporalio import activity

        from zentinelle.temporal import activities

        beats = []
        real_heartbeat = activity.heartbeat

        def recording_heartbeat(*details):
            real_heartbeat(*details)  # raises outside the activity context
            beats.append(1)

        with patch.object(activities, 'HEARTBEAT_INTERVAL_SECONDS', 0.05), \
                patch.object(activities.activity, 'heartbeat', recording_heartbeat):
            self.run_task(Task(lambda: time.sleep(0.5), 'test.slow', Retry()))
        self.assertGreater(len(beats), 0)


class ScheduledSweepTests(TestCase):

    @patch('zentinelle.tasks.scheduled.start_task')
    def test_requeues_failed_and_stale_pending_events_only(self, start):
        from zentinelle.models import Event
        from zentinelle.tasks.events import process_event_batch
        from zentinelle.tasks.scheduled import (STALE_PENDING_AFTER,
                                                retry_failed_events)

        def event(status, age):
            created = Event.objects.create(
                event_type='heartbeat', event_category=Event.Category.TELEMETRY, status=status,
                occurred_at=timezone.now(),
            )
            Event.objects.filter(id=created.id).update(received_at=timezone.now() - age)
            return str(created.id)

        stale = event(Event.Status.PENDING, STALE_PENDING_AFTER + timedelta(minutes=1))
        failed = event(Event.Status.FAILED, timedelta(0))
        event(Event.Status.PENDING, timedelta(0))
        event(Event.Status.PROCESSED, timedelta(hours=1))

        self.assertEqual(retry_failed_events(), {'retried': 2})
        start.assert_called_once()
        self.assertIs(start.call_args.args[0], process_event_batch)
        self.assertEqual(set(start.call_args.args[1]), {stale, failed})
        self.assertEqual(Event.objects.get(id=failed).status, Event.Status.PENDING)


class AsyncScanTests(TestCase):

    def test_content_is_read_from_the_row_not_the_workflow_input(self):
        from zentinelle.models import ContentRule, ContentScan
        from zentinelle.models.llm_provider_key import _get_fernet
        from zentinelle.tasks.compliance import process_async_scan

        scan = ContentScan.objects.create(
            tenant_id='t', content_type=ContentScan.ContentType.USER_INPUT,
            content_hash='h', content_length=6, content_preview='secret',
            content_stored=True, content_encrypted=_get_fernet().encrypt(b'secret'),
            scan_mode=ContentRule.ScanMode.ASYNC,
        )
        with patch('zentinelle.services.content_scanner.ContentScanner') as scanner:
            scanner.return_value.scan.return_value = (
                SimpleNamespace(has_violations=False, action='allow'), scan)
            process_async_scan(str(scan.id))

        self.assertEqual(scanner.return_value.scan.call_args.kwargs['content'], 'secret')
        scan.refresh_from_db()
        self.assertIsNone(scan.content_encrypted)


class ClickHouseSignalTests(TestCase):

    @patch('zentinelle.signals.start_task')
    def test_no_workflow_when_clickhouse_is_not_configured(self, start):
        from zentinelle.models import Event

        with patch('zentinelle.services.clickhouse_service.is_configured', return_value=False):
            Event.objects.create(event_type='heartbeat', event_category=Event.Category.TELEMETRY,
                                 occurred_at=timezone.now())
        start.assert_not_called()

        with patch('zentinelle.services.clickhouse_service.is_configured', return_value=True):
            Event.objects.create(event_type='heartbeat', event_category=Event.Category.TELEMETRY,
                                 occurred_at=timezone.now())
        start.assert_called_once()
        self.assertFalse(start.call_args.kwargs['wait'])
