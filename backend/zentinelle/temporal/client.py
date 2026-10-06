"""Starting task workflows from synchronous Django code.

The Temporal client is async and holds a gRPC connection, so one client lives
on a private event loop thread per process, created on first use (after any
gunicorn fork) and reused by every request.

Temporal stays off the request path's critical section: hot paths start
without waiting, every RPC has a short deadline, and after a failure the
helper fails fast for UNAVAILABLE_BACKOFF_SECONDS instead of dialing again on
every request. Work dropped that way is picked up by the scheduled sweeps
(`retry_failed_events` for events, `dispatch_event_outbox` for projections).
"""
import asyncio
import logging
import threading
import time
import uuid
from datetime import timedelta
from typing import Optional

from django.conf import settings
from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError

from zentinelle.temporal.registry import DEFAULT_TIMEOUT_SECONDS, Task
from zentinelle.temporal.workflows import TaskInput, TaskWorkflow

logger = logging.getLogger(__name__)

# Deadline for one connect or one StartWorkflowExecution RPC.
RPC_TIMEOUT_SECONDS = 2
# After a failed connect or start, fail fast for this long.
UNAVAILABLE_BACKOFF_SECONDS = 30


class TemporalUnavailable(RuntimeError):
    """Temporal failed recently; the start was not attempted."""


_lock = threading.Lock()
_loop: Optional[asyncio.AbstractEventLoop] = None
_client: Optional[Client] = None
_connect_lock: Optional[asyncio.Lock] = None
_unavailable_until = 0.0


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


def _mark_unavailable():
    global _unavailable_until
    _unavailable_until = time.monotonic() + UNAVAILABLE_BACKOFF_SECONDS


async def _get_client() -> Client:
    global _client, _connect_lock
    if _client is not None:
        return _client
    if _connect_lock is None:
        _connect_lock = asyncio.Lock()
    async with _connect_lock:
        if _client is None:
            if time.monotonic() < _unavailable_until:
                raise TemporalUnavailable("Temporal connect failed recently")
            try:
                _client = await asyncio.wait_for(connect(), RPC_TIMEOUT_SECONDS)
            except Exception:
                _mark_unavailable()
                raise
    return _client


async def _start(workflow_id: str, payload: TaskInput, start_delay: Optional[timedelta]):
    client = await _get_client()
    try:
        await client.start_workflow(
            TaskWorkflow.run,
            payload,
            id=workflow_id,
            task_queue=settings.TEMPORAL_TASK_QUEUE,
            start_delay=start_delay,
            rpc_timeout=timedelta(seconds=RPC_TIMEOUT_SECONDS),
        )
    except WorkflowAlreadyStartedError:
        raise
    except Exception:
        _mark_unavailable()
        raise


def _log_background_failure(workflow_id: str):
    def done(future):
        if future.cancelled():
            return
        exc = future.exception()
        if exc is None or isinstance(exc, WorkflowAlreadyStartedError):
            return
        logger.warning("Failed to start %s: %s", workflow_id, exc)
    return done


_warned_no_address = False


def start_task(task: Task, *args, workflow_id: Optional[str] = None,
               start_delay: Optional[timedelta] = None, wait: bool = True, **kwargs) -> str:
    """Start `task` in the background and return its workflow id.

    Pass `workflow_id` for work that is idempotent per key (one report, one
    event): a second start while the first is still running is dropped rather
    than run twice.

    With wait=True the call blocks until the server accepts the start (at most
    about RPC_TIMEOUT_SECONDS per RPC) and raises on failure, the same as a
    Celery `.delay()` against a dead broker. Request hot paths pass
    wait=False: the start is handed to the client thread and a failure is only
    logged, so a Temporal outage never holds a request. Either way, while
    Temporal is marked unavailable the call raises TemporalUnavailable at once
    (wait=True) or drops the start with a debug log (wait=False).

    With TEMPORAL_ADDRESS empty nothing is started.
    """
    global _warned_no_address
    workflow_id = f"{task.name}:{workflow_id or uuid.uuid4()}"
    if not settings.TEMPORAL_ADDRESS:
        if not _warned_no_address:
            logger.warning("TEMPORAL_ADDRESS is empty; background tasks are not started")
            _warned_no_address = True
        logger.debug("TEMPORAL_ADDRESS is empty; not starting %s", workflow_id)
        return workflow_id

    if time.monotonic() < _unavailable_until:
        if not wait:
            logger.debug("Temporal unavailable; dropped %s", workflow_id)
            return workflow_id
        raise TemporalUnavailable(f"Temporal unavailable; {workflow_id} not started")

    payload = task_input(task, args, kwargs)
    future = asyncio.run_coroutine_threadsafe(_start(workflow_id, payload, start_delay), _event_loop())
    if not wait:
        future.add_done_callback(_log_background_failure(workflow_id))
        return workflow_id
    try:
        # Connect plus start, each under its own deadline.
        future.result(timeout=2 * RPC_TIMEOUT_SECONDS + 1)
    except WorkflowAlreadyStartedError:
        logger.debug("%s is already running", workflow_id)
    except TimeoutError:
        future.cancel()
        raise
    return workflow_id
