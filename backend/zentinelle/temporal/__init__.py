"""Background work on Temporal: task registry, enqueue helper, worker, schedules.

Every background job is a plain function decorated with `registry.task`. The
worker registers each one as a Temporal activity, and one generic workflow
(`ZentinelleTask`) runs a single activity with the retry policy the task
declared. Enqueue sites call `client.start_task`; periodic jobs are Temporal
Schedules declared in `settings.TEMPORAL_SCHEDULES` and upserted by the worker
at start.

Nothing is imported here: the workflow sandbox loads this package, and it must
not pull Django in.
"""
