"""The one workflow every task runs under.

This module is loaded inside the Temporal workflow sandbox, so it imports
nothing from Django or the rest of zentinelle.
"""
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

WORKFLOW_NAME = "ZentinelleTask"


@dataclass
class TaskInput:
    name: str
    args: list = field(default_factory=list)
    kwargs: dict = field(default_factory=dict)
    max_attempts: int = 1
    initial_interval_seconds: float = 1.0
    backoff_coefficient: float = 2.0
    maximum_interval_seconds: Optional[float] = None
    timeout_seconds: float = 3600


@workflow.defn(name=WORKFLOW_NAME)
class TaskWorkflow:
    @workflow.run
    async def run(self, task: TaskInput) -> Any:
        maximum = task.maximum_interval_seconds
        return await workflow.execute_activity(
            task.name,
            args=[task.args, task.kwargs],
            start_to_close_timeout=timedelta(seconds=task.timeout_seconds),
            retry_policy=RetryPolicy(
                maximum_attempts=task.max_attempts,
                initial_interval=timedelta(seconds=task.initial_interval_seconds),
                backoff_coefficient=task.backoff_coefficient,
                maximum_interval=timedelta(seconds=maximum) if maximum else None,
            ),
        )
