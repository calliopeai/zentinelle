"""The `@task` decorator and the registry the worker builds activities from."""
import functools
from dataclasses import dataclass
from typing import Optional

# One hour, the time limit every Celery task ran under.
DEFAULT_TIMEOUT_SECONDS = 60 * 60

REGISTRY: dict[str, "Task"] = {}


@dataclass(frozen=True)
class Retry:
    """Activity retry policy. max_attempts counts the first attempt."""

    max_attempts: int = 1
    initial_interval_seconds: float = 1.0
    backoff_coefficient: float = 2.0
    maximum_interval_seconds: Optional[float] = None


class Task:
    """A registered background job. Calling it runs it inline."""

    def __init__(self, fn, name: str, retry: Retry):
        functools.update_wrapper(self, fn)
        self.fn = fn
        self.name = name
        self.retry = retry

    def __call__(self, *args, **kwargs):
        return self.fn(*args, **kwargs)

    def __repr__(self):
        return f"<task {self.name}>"


def task(fn=None, *, name=None, retries=0, retry_delay=None, backoff_max=600):
    """Register `fn` as a background job.

    retries is the number of retries after the first attempt. With
    retry_delay the retries are spaced evenly (Celery's default_retry_delay);
    without it they back off exponentially from 1s up to backoff_max (Celery's
    retry_backoff). The name defaults to `module.function`, the name Celery
    gave the same function, so schedules and logs keep their identifiers.
    """

    def register(f):
        if retry_delay is not None:
            retry = Retry(retries + 1, float(retry_delay), 1.0, None)
        else:
            retry = Retry(retries + 1, 1.0, 2.0, float(backoff_max))
        registered = Task(f, name or f"{f.__module__}.{f.__name__}", retry)
        if registered.name in REGISTRY and REGISTRY[registered.name].fn is not f:
            raise ValueError(f"Duplicate task name {registered.name}")
        REGISTRY[registered.name] = registered
        return registered

    return register(fn) if fn is not None else register
