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

from zentinelle.temporal.activities import build_activities, load_tasks
from zentinelle.temporal.client import connect
from zentinelle.temporal.schedules import sync_schedules
from zentinelle.temporal.workflows import TaskWorkflow

# Concurrent activities per worker; the Celery worker ran with --concurrency=2.
ACTIVITY_CONCURRENCY = 4

# On SIGTERM, running activities get this long to finish before the worker
# exits, inside the 30s ECS and compose give a container to stop.
GRACEFUL_SHUTDOWN = timedelta(seconds=25)


class Command(BaseCommand):
    help = "Run the Temporal worker and upsert the Temporal Schedules."

    def handle(self, *args, **options):
        if not settings.TEMPORAL_ADDRESS:
            raise CommandError("TEMPORAL_ADDRESS is not set")
        asyncio.run(self._run())

    async def _run(self):
        client = await connect()
        await sync_schedules(client, load_tasks())
        with ThreadPoolExecutor(max_workers=ACTIVITY_CONCURRENCY) as executor:
            worker = Worker(
                client,
                task_queue=settings.TEMPORAL_TASK_QUEUE,
                workflows=[TaskWorkflow],
                activities=build_activities(),
                activity_executor=executor,
                max_concurrent_activities=ACTIVITY_CONCURRENCY,
                graceful_shutdown_timeout=GRACEFUL_SHUTDOWN,
            )
            stop = asyncio.Event()
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, stop.set)
            async with worker:
                self.stdout.write(
                    f"Temporal worker on {settings.TEMPORAL_ADDRESS} "
                    f"namespace={settings.TEMPORAL_NAMESPACE} queue={settings.TEMPORAL_TASK_QUEUE}"
                )
                await stop.wait()
