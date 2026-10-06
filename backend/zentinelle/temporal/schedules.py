"""Upsert settings.TEMPORAL_SCHEDULES as Temporal Schedules.

The settings dict is the single source of truth: the worker runs this at every
start, so a redeploy updates changed schedules in place, never duplicates one,
and deletes any `zentinelle-` schedule that is no longer declared.
"""
import logging

from django.conf import settings
from temporalio.client import (Client, Schedule, ScheduleActionStartWorkflow,
                               ScheduleAlreadyRunningError,
                               ScheduleIntervalSpec, ScheduleSpec,
                               ScheduleUpdate)

from zentinelle.temporal.client import task_input
from zentinelle.temporal.registry import Task
from zentinelle.temporal.workflows import TaskWorkflow

logger = logging.getLogger(__name__)

SCHEDULE_PREFIX = "zentinelle-"


def build_schedule(schedule_id: str, entry: dict, tasks: dict[str, Task]) -> Schedule:
    task = tasks[entry["task"]]
    if "every" in entry:
        spec = ScheduleSpec(intervals=[ScheduleIntervalSpec(every=entry["every"])])
    else:
        spec = ScheduleSpec(cron_expressions=[entry["cron"]])
    return Schedule(
        action=ScheduleActionStartWorkflow(
            TaskWorkflow.run,
            task_input(task),
            id=schedule_id,
            task_queue=settings.TEMPORAL_TASK_QUEUE,
        ),
        spec=spec,
    )


async def sync_schedules(client: Client, tasks: dict[str, Task]) -> None:
    declared = settings.TEMPORAL_SCHEDULES
    for schedule_id, entry in declared.items():
        schedule = build_schedule(schedule_id, entry, tasks)
        try:
            await client.create_schedule(schedule_id, schedule)
            logger.info("Created schedule %s", schedule_id)
        except ScheduleAlreadyRunningError:
            await client.get_schedule_handle(schedule_id).update(
                lambda _current, schedule=schedule: ScheduleUpdate(schedule=schedule)
            )
            logger.info("Updated schedule %s", schedule_id)

    async for listed in await client.list_schedules():
        if listed.id.startswith(SCHEDULE_PREFIX) and listed.id not in declared:
            await client.get_schedule_handle(listed.id).delete()
            logger.info("Deleted undeclared schedule %s", listed.id)
