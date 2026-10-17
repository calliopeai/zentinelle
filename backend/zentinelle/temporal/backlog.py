"""The task queue backlog, published for the worker autoscaler (#475).

Workers scale on how much work is waiting, not on CPU: an idle-looking worker
fleet with a growing backlog needs more workers, and a busy one with none
waiting does not. The worker publishes the backlog of its task queue as a
CloudWatch embedded metric format line on stdout, which the awslogs driver
turns into a metric on ECS. On EKS, KEDA's Temporal scaler reads the same
backlog from Temporal directly.
"""
import asyncio
import json
import logging
import time

from temporalio.api.enums.v1 import TaskQueueType
from temporalio.api.taskqueue.v1 import TaskQueue
from temporalio.api.workflowservice.v1 import DescribeTaskQueueRequest

logger = logging.getLogger(__name__)

_TASK_TYPES = (TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW, TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY)


async def task_queue_backlog(client, task_queue: str) -> tuple[int, float]:
    """Tasks waiting on task_queue, workflow and activity tasks together, and
    the age in seconds of the oldest.

    A server that reports task queue stats (approximate backlog count and
    age) is read for those; an older one only gives a backlog count hint, and
    no age.
    """
    count, age = 0, 0.0
    for task_type in _TASK_TYPES:
        response = await client.workflow_service.describe_task_queue(DescribeTaskQueueRequest(
            namespace=client.namespace,
            task_queue=TaskQueue(name=task_queue),
            task_queue_type=task_type,
            report_stats=True,
            include_task_queue_status=True,
        ))
        if response.HasField('stats'):
            count += response.stats.approximate_backlog_count
            age = max(age, response.stats.approximate_backlog_age.ToTimedelta().total_seconds())
        else:
            count += response.task_queue_status.backlog_count_hint
    return count, age


def backlog_record(namespace: str, task_queue: str, count: int, age: float, now: float) -> dict:
    """One embedded metric format record for a task queue's backlog."""
    return {
        '_aws': {
            'Timestamp': int(now * 1000),
            'CloudWatchMetrics': [{
                'Namespace': namespace,
                'Dimensions': [['TaskQueue']],
                'Metrics': [
                    {'Name': 'ApproximateBacklogCount', 'Unit': 'Count'},
                    {'Name': 'ApproximateBacklogAgeSeconds', 'Unit': 'Seconds'},
                ],
            }],
        },
        'TaskQueue': task_queue,
        'ApproximateBacklogCount': count,
        'ApproximateBacklogAgeSeconds': age,
    }


async def publish_backlog(client, task_queue: str, namespace: str, interval: float,
                          stop: asyncio.Event, write) -> None:
    """Write the backlog record every interval until stop is set.

    A failed read is logged and skipped: a missing data point leaves the
    scaler where it is, which is safer than a zero that would scale in.
    """
    while not stop.is_set():
        try:
            count, age = await task_queue_backlog(client, task_queue)
            write(json.dumps(backlog_record(namespace, task_queue, count, age, time.time())))
        except Exception:
            logger.warning('Could not read the backlog of task queue %s', task_queue, exc_info=True)
        try:
            await asyncio.wait_for(stop.wait(), interval)
        except asyncio.TimeoutError:
            pass
