# Full stack: Workbench, Astrolift and Zentinelle (AWS)

Build, run, watch, govern: the Calliope AI Workbench, Astrolift and Zentinelle in one account, with Zentinelle on Astrolift's tenant cluster and wired to the other two from the console with **Enable integrations**. Two cards build it:

| Card | The Workbench runs | Zentinelle with Astrolift | Zentinelle with the Workbench |
|---|---|---|---|
| **The Full loop** | On Astrolift's tenant cluster | Offered | Refused today (see [known blockers](#known-blockers)) |
| **Zentinelle in Astrolift, Workbench beside** | Its own ECS hub and infrastructure | Offered | Offered |

On both, Astrolift joins a VPC, ECS cluster, Aurora cluster and load balancer that already exist in the account. This page follows the Full loop and says where the other card differs.

!!! warning "Not yet validated end to end"
    Written from `calliope-installer` main `568eec4` and Zentinelle main. No step on this page has been run end to end on a clean AWS account yet; both cluster placements have been certified on local kind clusters only, and the first-policy check was run against Zentinelle's API locally, not on AWS. Read the [known blockers](#known-blockers) first.

The Astrolift and Workbench side of this blueprint is [The Full loop](https://astrolift.dev/operators/blueprints/full-loop/) and [Workbench on Astrolift](https://astrolift.dev/operators/blueprints/workbench-on-astrolift/) in the Astrolift documentation.

## What you need

The [common prerequisites](index.md#before-you-start), with a hosted zone dedicated to this deployment, and on **What we need from you**:

| Group | Fields |
|---|---|
| Deployment | **Deployment name**, **Admin email** (the Workbench's administrator), **Image registry** |
| DNS | **Domain**, **Hosted zone ID**; optional **Workbench subdomain** (`hub` by default) |
| Network | **VPC ID**, **Private subnet IDs**; optional public subnet IDs |
| Container cluster | **ECS cluster** |
| Database | **Cluster identifier**, **Cluster writer endpoint**, **Master credentials secret ARN** of the existing Aurora cluster |
| Load balancer and certificate | **Load balancer ARN**, **HTTPS listener ARN**, **Certificate ARN** |
| Astrolift administrator and sign-in | **Astrolift administrator email**; optional Cognito app client and hosted sign-in domain (the pool is the one named under the Workbench's adoption) |

Zentinelle adds no required field. Capacity must be on-demand, or Spot with the on-demand anchor.

The wizard estimates **about $470 to $1,120 a month** on Balanced and about $330 to $760 on Lean, beyond the infrastructure it joins. **Zentinelle in Astrolift, Workbench beside** estimates about $650 to $1,240 on Balanced and $430 to $820 on Lean, because the Workbench builds its own network, database and load balancer.

## Choose it

1. **Choose what to install**: **The Full loop**.
2. **Pick the cloud**: AWS and a region.
3. **Pick a footprint**.
4. **Review the drawing**: the card sets **Share everything**, and "Where the Workbench runs" and "Where Zentinelle runs" to **On the Astrolift tenant cluster**. Keep "Tenant runtime" on **Create a cluster**.
5. Fill in the values, review **Before we start**, and finish setup.

The card resolves to four units: **Calliope AI Workbench on the Astrolift cluster**, **Astrolift**, **Zentinelle** and **Zentinelle on the Astrolift cluster**. **Zentinelle in Astrolift, Workbench beside** resolves to **Calliope AI Workbench**, **Astrolift**, **Zentinelle** and **Zentinelle on the Astrolift cluster**.

## Apply

First make sure the adopted Aurora cluster admits TCP `5432` from inside the VPC; Astrolift adds no rules to it. Then on **Install**:

1. **Create state store**, and wait for its job on **History**.
2. Dry run **Plan Astrolift**, read the plan, **Deploy** it.
3. Dry run **Plan Zentinelle**, read the plan, **Deploy** it. Its ECS services are created at zero and parked after the apply.
4. Dry run **Plan Zentinelle on the Astrolift cluster**, read the plan, **Deploy** it. The dry run is refused until step 3 has marked the record. This unit opens its own NodePorts to the load balancer's security groups.
5. Add the rule the Workbench unit does not add for an adopted load balancer: the tenant nodes' security group admits the load balancer's security group on TCP `30808`.
6. Dry run **Plan Calliope AI Workbench on the Astrolift cluster**, read the plan, **Deploy** it.

On **Zentinelle in Astrolift, Workbench beside**, step 5 does not apply and step 6 is **Plan Calliope AI Workbench**, the Workbench's own ECS hub; dry run and deploy the units in the order **Install** lists them.

## Verify

```bash
curl -fsS https://zen.<domain>/api/zentinelle/v1/health     # {"status": "ok"}
curl -fsS -o /dev/null -w '%{http_code}\n' https://hub.<domain>/hub/health   # 200
```

From inside the VPC, with the identity that applied the install:

```bash
aws eks update-kubeconfig --name <deployment>-astrolift --region <region>
kubectl -n zentinelle get pod -o wide
kubectl -n calliopeai get pod -o wide
```

Expected: Zentinelle's backend, console and Temporal and the Workbench hub on the node labelled `astrolift.ai/anchor=true`, beside Astrolift's platform pods. The installer does not check that they fit on the anchor before the apply; on Lean the anchor is a `t3.large`.

## Enable integrations

Both integrations are on **Install**, under **Integrations**. Each queues one job that runs inside your account; **History** shows it.

### Zentinelle with Astrolift

Press **Connect**, name the **Astrolift organization (slug)** (the deployment name for the first organization), and confirm. The job mints a one-time enrollment code, runs Astrolift's `connect_zentinelle` as a one-off task, records the organization and then seeds Zentinelle's three audit-mode policies. Expected on **History**: `Zentinelle with Astrolift enabled for organization <slug>; Zentinelle's audit-mode policies seeded`, and an `integration-policy-seed` line. The steps and their output are as in [Inside Astrolift](in-astrolift.md#enable-integrations-connect-astrolift).

### Zentinelle with the Workbench

Offered on **Zentinelle in Astrolift, Workbench beside**, where the Workbench runs its own ECS hub; on the Full loop it shows the refusal instead. Press **Enable** and confirm. The job:

1. reads the hub image's `ai.calliope.junohub.build` label and refuses a hub older than junohub `0ac6a81` (build 4406), which would ignore what Enable writes. When the label cannot be read at all, the job says so and goes on;
2. registers the hub's agent host endpoint, `<deployment>-workbench-agent-host`, in this Zentinelle as type `agent_host` and takes the key it mints;
3. writes the key into the hub secret `<prefix>-junohub-secret` as `AGENT_HOST_ZENTINELLE_KEY`, keeping every other key, and refusing if the secret changed since it was read;
4. records `JUNOHUB_AGENT_HOST_ZENTINELLE_URL` (Zentinelle's URL) and adds `agenthost` to `JUNOHUB_ENABLE_SERVICES` in the install record;
5. queues a Workbench **Dry run** with those settings, and seeds the policies (skipped for any type the first integration already created).

Nothing changes on the hub until you read and **Deploy** that queued plan: the hub reads its environment at start. Expected on **History**: `Zentinelle with the Workbench enabled; Zentinelle's audit-mode policies seeded`, then the queued plan.

Check the key landed, without printing it:

```bash
aws secretsmanager get-secret-value --region <region> --secret-id <prefix>-junohub-secret \
  --query SecretString --output text | jq '.AGENT_HOST_ZENTINELLE_KEY | length > 0'
```

Expected: `true`. After the deploy, agent host servers the hub starts carry `ZENTINELLE_ENDPOINT` and `ZENTINELLE_AGENT_HOST_KEY`; servers already running keep their old environment until restarted.

Enable is refused, with the reason on the control, when the Workbench runs the agent host tap (it sets its own Zentinelle URL), when its `terraform.tfvars` is not rendered from the install record (adopt the Workbench's settings first), or before Zentinelle has been planned. **Rotate** mints a new key for the same endpoint and writes it to the secret; agent hosts started from then on read it.

## First policy firing

With `ZEN=https://zen.<domain>`, follow [The first policy firing](index.md#the-first-policy-firing): register the test agent, evaluate the deep, sensitive spawn, and read `"action": "alert"` with the two `[Audit]` warnings. Then remove the test agent. The Workbench's agent host endpoint is registered in the same standalone tenant, so its tool calls are evaluated against the same organization-wide policies.

## Undo

1. **Zentinelle with the Workbench.** **Disable** revokes the key in Zentinelle, blanks it in the hub secret (blanked, not removed, so running task definitions that name it still start), removes the settings from the record and queues a Workbench Dry run. Deploy that plan.
2. **Zentinelle with Astrolift.** **Forget** drops the organization from the record only; an Astrolift organization admin disconnects it in Astrolift's Zentinelle settings.
3. **The policies** stay until you change or delete them in Zentinelle's console.
4. **The install.** **Teardown** enforces the order: **Calliope AI Workbench on the Astrolift cluster**, **Zentinelle on the Astrolift cluster**, **Zentinelle**, then **Astrolift**. The infrastructure you supplied and the hosted zone are kept; remove the security group rules you added yourself. Then retire the deployment and remove the state store and the Deployment Manager as in [Undo](index.md#undo).

## Known blockers

The [common blockers](index.md#known-blockers) apply. For this blueprint in particular:

- **The Workbench integration is refused on the Full loop.** With the Workbench on Astrolift's cluster, Enable answers "the Workbench runs on Astrolift's cluster, whose hub env this does not render", so agent hosts there get no Zentinelle endpoint or key from the console. Use **Zentinelle in Astrolift, Workbench beside** for both integrations today.
- **Hand steps on adopted infrastructure.** The NodePort `30808` rule for the adopted load balancer and `5432` on the adopted Aurora cluster are yours to add and to remove.
- **Hub image age.** The Workbench integration needs a hub image from junohub `0ac6a81` on. A registry the Deployment Manager cannot read leaves that unchecked, with a warning in the job's log.
- **Both cluster placements on real EKS.** Certified on kind clusters only.
