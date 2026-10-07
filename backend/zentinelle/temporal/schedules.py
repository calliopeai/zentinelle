"""Upsert settings.TEMPORAL_SCHEDULES as Temporal Schedules.

The settings dict is the single source of truth: the worker runs this at every
start, so a redeploy updates changed schedules in place, never duplicates one,
and deletes any `zentinelle-` schedule that is no longer declared. An update
keeps the schedule's current state, so a pause set in the Temporal UI survives
a redeploy.

Every start runs it against whatever the server already holds (a restart, a
task moved to another node, a Spot reclaim, two workers starting at once), so
each step is idempotent: create when missing, update in place when present,
and a schedule another worker already deleted is not an error.
"""
import dataclasses
import logging
from datetime import timedelta

from django.conf import settings
from temporalio.client import (Client, Schedule, ScheduleActionStartWorkflow,
                               ScheduleAlreadyRunningError,
                               ScheduleIntervalSpec, ScheduleOverlapPolicy,
                               SchedulePolicy, ScheduleSpec, ScheduleUpdate,
                               ScheduleUpdateInput)
from temporalio.service import RPCError, RPCStatusCode

from zentinelle.temporal.client import task_input
from zentinelle.temporal.registry import Task
from zentinelle.temporal.workflows import TaskWorkflow

logger = logging.getLogger(__name__)

SCHEDULE_PREFIX = "zentinelle-"

# Beat never backfilled: a slot missed while it was down was simply skipped.
# One minute of catch-up keeps that, and overlap is skipped explicitly.
SCHEDULE_POLICY = SchedulePolicy(
    overlap=ScheduleOverlapPolicy.SKIP,
    catchup_window=timedelta(minutes=1),
)


def keep_current_state(schedule: Schedule):
    """Updater that applies `schedule` but keeps the live schedule's state
    (paused, note), which the updater reads from the current description."""
    def updater(current: ScheduleUpdateInput) -> ScheduleUpdate:
        return ScheduleUpdate(schedule=dataclasses.replace(
            schedule, state=current.description.schedule.state))
    return updater


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
        policy=SCHEDULE_POLICY,
    )


async def sync_schedules(client: Client, tasks: dict[str, Task]) -> None:
    declared = settings.TEMPORAL_SCHEDULES
    for schedule_id, entry in declared.items():
        schedule = build_schedule(schedule_id, entry, tasks)
        try:
            await client.create_schedule(schedule_id, schedule)
            logger.info("Created schedule %s", schedule_id)
        except ScheduleAlreadyRunningError:
            await client.get_schedule_handle(schedule_id).update(keep_current_state(schedule))
            logger.info("Updated schedule %s", schedule_id)

    async for listed in await client.list_schedules():
        if listed.id.startswith(SCHEDULE_PREFIX) and listed.id not in declared:
            try:
                await client.get_schedule_handle(listed.id).delete()
            except RPCError as err:
                if err.status != RPCStatusCode.NOT_FOUND:
                    raise
                continue
            logger.info("Deleted undeclared schedule %s", listed.id)
