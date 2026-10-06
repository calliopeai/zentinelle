"""Starting task workflows from synchronous Django code.

The Temporal client is async and holds a gRPC connection, so one client lives
on a private event loop thread per process, created on first use (after any
gunicorn fork) and reused by every request.
"""
import asyncio
import logging
import threading
import uuid
from datetime import timedelta
from typing import Optional

from django.conf import settings
from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError

from zentinelle.temporal.registry import DEFAULT_TIMEOUT_SECONDS, Task
from zentinelle.temporal.workflows import TaskInput, TaskWorkflow

logger = logging.getLogger(__name__)

# How long a request waits for the server to accept a start.
START_TIMEOUT_SECONDS = 10

_lock = threading.Lock()
_loop: Optional[asyncio.AbstractEventLoop] = None
_client: Optional[Client] = None


def task_input(task: Task, args=(), kwargs=None) -> TaskInput:
    return TaskInput(
        name=task.name,
        args=list(args),
        kwargs=dict(kwargs or {}),
        max_attempts=task.retry.max_attempts,
        initial_interval_seconds=task.retry.initial_interval_seconds,
        backoff_coefficient=task.retry.backoff_coefficient,
        maximum_interval_seconds=task.retry.maximum_interval_seconds,
        timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
    )


async def connect() -> Client:
    return await Client.connect(settings.TEMPORAL_ADDRESS, namespace=settings.TEMPORAL_NAMESPACE)


def _event_loop() -> asyncio.AbstractEventLoop:
    global _loop
    with _lock:
        if _loop is None:
            _loop = asyncio.new_event_loop()
            threading.Thread(target=_loop.run_forever, name="temporal-client", daemon=True).start()
        return _loop


async def _start(workflow_id: str, payload: TaskInput, start_delay: Optional[timedelta]):
    global _client
    if _client is None:
        _client = await connect()
    await _client.start_workflow(
        TaskWorkflow.run,
        payload,
        id=workflow_id,
        task_queue=settings.TEMPORAL_TASK_QUEUE,
        start_delay=start_delay,
    )


def start_task(task: Task, *args, workflow_id: Optional[str] = None,
               start_delay: Optional[timedelta] = None, **kwargs) -> str:
    """Start `task` in the background and return its workflow id.

    Pass `workflow_id` for work that is idempotent per key (one report, one
    event): a second start while the first is still running is dropped rather
    than run twice. Raises if the server cannot be reached, the same as a
    Celery `.delay()` against a dead broker; callers decide whether to swallow.
    With TEMPORAL_ADDRESS empty (tests) nothing is started.
    """
    workflow_id = f"{task.name}:{workflow_id or uuid.uuid4()}"
    if not settings.TEMPORAL_ADDRESS:
        logger.debug("TEMPORAL_ADDRESS is empty; not starting %s", workflow_id)
        return workflow_id

    payload = task_input(task, args, kwargs)
    future = asyncio.run_coroutine_threadsafe(_start(workflow_id, payload, start_delay), _event_loop())
    try:
        future.result(timeout=START_TIMEOUT_SECONDS)
    except WorkflowAlreadyStartedError:
        logger.debug("%s is already running", workflow_id)
    return workflow_id
