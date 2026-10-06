"""Turn every registered task into a Temporal activity."""
import contextvars
import importlib
import json
import threading

from django.core.serializers.json import DjangoJSONEncoder
from django.db import close_old_connections
from temporalio import activity

from zentinelle.temporal.registry import REGISTRY, Task

# Every module that declares tasks. tasks.infrastructure is left out on
# purpose: its models do not exist and the module says not to import it.
TASK_MODULES = (
    "zentinelle.tasks.billing",
    "zentinelle.tasks.clickhouse_sync",
    "zentinelle.tasks.compliance",
    "zentinelle.tasks.compliance_monitoring",
    "zentinelle.tasks.events",
    "zentinelle.tasks.license_compliance",
    "zentinelle.tasks.notifications",
    "zentinelle.tasks.reports",
    "zentinelle.tasks.scheduled",
)


def load_tasks() -> dict[str, Task]:
    for module in TASK_MODULES:
        importlib.import_module(module)
    return dict(REGISTRY)


# Well inside workflows.HEARTBEAT_TIMEOUT.
HEARTBEAT_INTERVAL_SECONDS = 15


def _heartbeat_until(done: threading.Event):
    while not done.wait(HEARTBEAT_INTERVAL_SECONDS):
        activity.heartbeat()


def as_activity(task: Task):
    @activity.defn(name=task.name)
    def run(args: list, kwargs: dict):
        # Task bodies are plain functions that never heartbeat, so a side
        # thread does it for them while they run. It carries the activity
        # context over; heartbeat() is thread safe for sync activities.
        done = threading.Event()
        context = contextvars.copy_context()
        threading.Thread(
            target=context.run, args=(_heartbeat_until, done),
            name=f"heartbeat-{task.name}", daemon=True,
        ).start()
        # Activities run on worker threads that outlive any one job, so stale
        # connections are dropped the way Django drops them per request.
        close_old_connections()
        try:
            result = task.fn(*args, **kwargs)
        finally:
            done.set()
            close_old_connections()
        # Results are informational (nothing reads them back), but they are
        # what the Temporal UI shows, so keep them; Decimal and datetime would
        # otherwise fail the payload converter after the work already ran.
        return json.loads(json.dumps(result, cls=DjangoJSONEncoder))

    return run


def build_activities() -> list:
    return [as_activity(t) for t in load_tasks().values()]
