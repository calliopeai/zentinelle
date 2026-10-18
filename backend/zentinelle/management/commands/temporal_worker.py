"""Run the Temporal worker: every task as an activity, plus the schedules.

This one process replaces both the Celery worker and Celery beat.
"""
import asyncio
import signal
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from temporalio.worker import Worker

from config.secret_guard import refuse_insecure_secrets
from zentinelle.temporal.activities import build_activities, load_tasks
from zentinelle.temporal.backlog import publish_backlog
from zentinelle.temporal.client import connect
from zentinelle.temporal.schedules import sync_schedules
from zentinelle.temporal.workflows import TaskWorkflow

# Concurrent activities per worker; the Celery worker ran with --concurrency=2.
ACTIVITY_CONCURRENCY = 4


def build_worker(client, executor) -> Worker:
    return Worker(
        client,
        task_queue=settings.TEMPORAL_TASK_QUEUE,
        workflows=[TaskWorkflow],
        activities=build_activities(),
        activity_executor=executor,
        max_concurrent_activities=ACTIVITY_CONCURRENCY,
        # On SIGTERM: stop polling, let running activities finish.
        graceful_shutdown_timeout=timedelta(seconds=settings.TEMPORAL_WORKER_DRAIN_SECONDS),
    )


class Command(BaseCommand):
    help = "Run the Temporal worker and upsert the Temporal Schedules."

    def handle(self, *args, **options):
        refuse_insecure_secrets()
        if not settings.TEMPORAL_ADDRESS:
            raise CommandError("TEMPORAL_ADDRESS is not set")
        asyncio.run(self._run())

    async def _run(self):
        client = await connect()
        await sync_schedules(client, load_tasks())
        with ThreadPoolExecutor(max_workers=ACTIVITY_CONCURRENCY) as executor:
            worker = build_worker(client, executor)
            stop = asyncio.Event()
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, stop.set)
            async with worker:
                self.stdout.write(
                    f"Temporal worker on {settings.TEMPORAL_ADDRESS} "
                    f"namespace={settings.TEMPORAL_NAMESPACE} queue={settings.TEMPORAL_TASK_QUEUE}"
                )
                publisher = None
                if settings.TEMPORAL_BACKLOG_METRIC_SECONDS > 0:
                    publisher = asyncio.create_task(publish_backlog(
                        client, settings.TEMPORAL_TASK_QUEUE, settings.TEMPORAL_BACKLOG_METRIC_NAMESPACE,
                        settings.TEMPORAL_BACKLOG_METRIC_SECONDS, stop, self.stdout.write,
                    ))
                await stop.wait()
                if publisher is not None:
                    await publisher
