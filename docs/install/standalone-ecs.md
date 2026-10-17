# Standalone on ECS (AWS)

Zentinelle alone, as its own ECS services. The install builds a VPC from the CIDR you give, an Aurora Serverless v2 cluster, ElastiCache Redis, a files bucket, a self-hosted Temporal, a public load balancer with a certificate, and four Fargate services: the backend (the REST API, GraphQL and the LLM proxy), the Temporal worker, the console and Temporal itself. Nothing is shared with another product, and it tears down on its own.

!!! warning "Not yet validated end to end"
    Written from `calliope-installer` main `568eec4` and Zentinelle main. No step on this page has been run end to end on a clean AWS account yet; the first-policy check was run against Zentinelle's API locally, not on AWS. Read the [known blockers](index.md#known-blockers) first.

## What you need

The [common prerequisites](index.md#before-you-start), and on **What we need from you**:

| Field | What it is |
|---|---|
| **Deployment name** | Prefixes every resource; at most 16 characters |
| **Domain** | The domain Zentinelle answers under, for example `example.com` |
| **Hosted zone ID** | The public Route 53 zone for that domain. Zentinelle writes only its own records and certificate under `zen.<domain>`, so the zone may serve other names |
| **VPC CIDR** | The range for the new VPC, for example `10.40.0.0/16` |

**Advanced: footprint** holds the optional rest: single NAT gateway, log retention, database backup retention and deletion protection, and the task size and count of the backend, the console and the worker, and the size of Temporal.

The wizard estimates **about $260 to $380 a month** on Balanced and about $150 to $240 on Lean, before usage.

## Choose it

1. **Choose what to install**: **Standalone**, and tick **Zentinelle** only under "Standalone: which products".
2. **Pick the cloud**: AWS and a region.
3. **Pick a footprint**.
4. **Review the drawing**: Zentinelle runs on **Its own ECS services** and shares nothing. The hostname is `zen` by default (short names); with long names it is `zentinelle`.
5. Fill in the four values, review **Before we start**, and finish setup.

The card resolves to one unit: **Zentinelle**.

## Apply

On **Install**:

1. **Create state store**, and wait for its job to finish on **History**.
2. Dry run **Plan Zentinelle**, read the plan, **Deploy** it. The apply creates the stack above, then runs the database bootstrap as a one-off task (the Zentinelle role, database and schemas inside the Aurora cluster, and the migrations) before the job completes.

## Verify

```bash
export DEPLOYMENT=<deployment> REGION=<region>
curl -fsS https://zen.<domain>/api/zentinelle/v1/health
```

Expected: `{"status": "ok"}`. The certificate is DNS-validated against your zone, so the name answers once the zone is publicly resolvable.

```bash
NAME=$DEPLOYMENT-zentinelle
aws ecs describe-services --region "$REGION" --cluster "$NAME" \
  --services "$NAME-backend" "$NAME-worker" "$NAME-frontend" "$NAME-temporal" \
  --query 'services[].[serviceName,runningCount,desiredCount]' --output table
```

Expected: each service's running count equals its desired count. `https://zen.<domain>` serves the console's sign-in page.

## Seed the policies

On Zentinelle alone no integration seeds anything, so run the seed once yourself, as the same one-off task the installer runs on the Astrolift blueprints: Zentinelle's bootstrap task definition, with its command replaced. It runs in the backend's subnets and security group, where the database accepts it.

```bash
NET=$(aws ecs describe-services --region "$REGION" --cluster "$NAME" --services "$NAME-backend" \
  --query 'services[0].networkConfiguration' --output json)

TASK=$(aws ecs run-task --region "$REGION" --cluster "$NAME" --launch-type FARGATE \
  --task-definition "$NAME-bootstrap" --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"bootstrap","command":["python","manage.py",
    "seed_integration_policies","--tenant","00000000-0000-0000-0000-000000000001","--source","workbench"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --region "$REGION" --cluster "$NAME" --tasks "$TASK"
aws ecs describe-tasks --region "$REGION" --cluster "$NAME" --tasks "$TASK" \
  --query 'tasks[0].containers[0].exitCode'
aws logs tail "/ecs/$NAME/bootstrap" --region "$REGION" --since 15m
```

Expected: exit code `0`, and in the log:

```text
created agent_delegation: "Agent delegation" in audit mode
created human_oversight: "Human oversight" in audit mode
created budget_limit: "Monthly budget" in audit mode
Done: 3 created, 0 already present, for tenant 00000000-0000-0000-0000-000000000001.
```

`--source` takes `workbench` or `astrolift` and only names the integration in each policy's description. A second run prints `skipped ...` for each type and creates nothing.

## First policy firing

With `ZEN=https://zen.<domain>`, follow [The first policy firing](index.md#the-first-policy-firing): register the test agent, evaluate the deep, sensitive spawn, and read `"action": "alert"` with the two `[Audit]` warnings. Then remove the test agent.

## Sign in to the console

No unit creates a console user (`AUTH_MODE` is `local`). Django's `createsuperuser`, run as the same kind of one-off task, makes one; a superuser holds the admin role. The password travels in the task's environment override, which anyone who can describe the task can read, so change it after the first sign-in.

```bash
aws ecs run-task --region "$REGION" --cluster "$NAME" --launch-type FARGATE \
  --task-definition "$NAME-bootstrap" --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"bootstrap",
    "command":["python","manage.py","createsuperuser","--noinput","--username","admin","--email","<you@example.com>"],
    "environment":[{"name":"DJANGO_SUPERUSER_PASSWORD","value":"<a long temporary password>"}]}]}'
```

Then sign in at `https://zen.<domain>` and open **Policies** to see the three seeded policies. This step has not been run on AWS.

## Undo

**Teardown**, **Zentinelle**: **keep data** keeps the database for a rebuild; **with data** removes it. Read the destroy plan, then deploy it. The hosted zone is kept. Then **Retire this deployment**, the state store and the Deployment Manager, as in [Undo](index.md#undo).

## Related

- [Zentinelle inside Astrolift](in-astrolift.md), the same product on Astrolift's tenant cluster.
- [Deployment Guide](../wiki/Deployment-Guide.md), for Zentinelle on Docker Compose or without the installer.
