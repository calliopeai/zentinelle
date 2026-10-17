# Inside Astrolift (AWS)

The gate inside the platform. Astrolift builds its own VPC, Aurora cluster, Temporal, load balancer and EKS tenant cluster. Zentinelle joins Astrolift's network, Aurora cluster and load balancer, and its backend, worker, console and a Temporal of its own run as pods on Astrolift's tenant cluster. Its database, Redis, secrets and DNS record stay managed by Zentinelle's ECS unit, whose services are kept at zero as the way back. Then **Enable integrations** connects an Astrolift organization to this Zentinelle and seeds the alert-mode policies.

Zentinelle never uses Astrolift's Temporal while it runs on the cluster: the cluster's nodes would admit every tenant pod to it, so Zentinelle runs its own there.

!!! warning "Not yet validated end to end"
    Written from `calliope-installer` main `568eec4` and Zentinelle main. No step on this page has been run end to end on a clean AWS account yet; the Zentinelle cluster placement has been certified on a local kind cluster only, and the first-policy check was run against Zentinelle's API locally, not on AWS. Read the [known blockers](#known-blockers) first.

The Astrolift side of this blueprint, including its first app and first agent run, is [Zentinelle in Astrolift](https://astrolift.dev/operators/blueprints/zentinelle-in-astrolift/) in the Astrolift documentation.

## What you need

The [common prerequisites](index.md#before-you-start), with a hosted zone dedicated to this deployment, and on **What we need from you**:

| Field | What it is |
|---|---|
| **Deployment name** | Prefixes every resource; at most 16 characters |
| **Domain** | The domain Astrolift manages, for example `apps.example.com`; Zentinelle answers at `zen.<domain>` |
| **Hosted zone ID** | The public Route 53 zone for that domain, dedicated to this deployment |
| **VPC CIDR** | The range for Astrolift's new VPC |
| **Astrolift administrator email** | Astrolift's first administrator, the owner of its first organization, whose slug defaults to the deployment name |
| **Cognito user pool**, **Cognito app client**, **Hosted sign-in domain** | Optional, named together or not at all. The default app sign-in needs them; see [known blockers](#known-blockers) |

Zentinelle adds no required field; **Advanced: footprint** gains the Zentinelle task sizes, database backup retention and deletion protection. Capacity must be on-demand, or Spot with the on-demand anchor node (Lean has the anchor): Zentinelle's backend, console and Temporal run on the anchor, and Spot without it is refused on the requirements screen.

The wizard estimates **about $500 to $880 a month** on Balanced and about $310 to $560 on Lean, before usage.

## Choose it

1. **Choose what to install**: **Zentinelle in Astrolift**.
2. **Pick the cloud**: AWS and a region.
3. **Pick a footprint**.
4. **Review the drawing**: the card sets "What the products share" to **Share everything** and "Where Zentinelle runs" to **On the Astrolift tenant cluster**. Keep "Tenant runtime" on **Create a cluster**; with an attached cluster, or with less shared, Zentinelle falls back to its own ECS services.
5. Fill in the values, review **Before we start**, and finish setup.

The card resolves to three units: **Astrolift**, **Zentinelle** and **Zentinelle on the Astrolift cluster**.

## Apply

On **Install**:

1. **Create state store**, and wait for its job on **History**.
2. Dry run **Plan Astrolift**, read the plan, **Deploy** it. Its apply records the cluster name, OIDC provider, node security group and anchor node group the next units read.
3. Dry run **Plan Zentinelle**, read the plan, **Deploy** it. The task role trusts the cluster's `zentinelle` service account, and the ECS services are created at zero. After the apply, the Deployment Manager parks Zentinelle's ECS services and marks the record parked; the database bootstrap still runs as Zentinelle's one-off ECS task.
4. Dry run **Plan Zentinelle on the Astrolift cluster**, read the plan, **Deploy** it. The dry run is refused until step 3 has marked the record, so two Zentinelles never run against one database. Expect two target groups and their Auto Scaling attachments, three listener rules, the NodePort and Redis rules, the `zentinelle` namespace, its service account, a Secret and one Helm release.

## Verify

```bash
curl -fsS https://zen.<domain>/api/zentinelle/v1/health
```

Expected: `{"status": "ok"}`. With long names the host is `zentinelle.<domain>`; with short names that long form redirects to `zen.<domain>`.

The tenant cluster's Kubernetes API is private by default, so run `kubectl` from inside the VPC (a bastion or a pod), with the AWS identity that applied the install, or use the EKS console:

```bash
aws eks update-kubeconfig --name <deployment>-astrolift --region <region>
kubectl -n zentinelle get pod -o wide
```

Expected: `zentinelle-backend`, `zentinelle-frontend` and `zentinelle-temporal` running on the node labelled `astrolift.ai/anchor=true`, and `zentinelle-worker` preferring the other nodes. Both Zentinelle target groups show the anchor healthy.

## Enable integrations: connect Astrolift

On **Install**, under **Integrations**, **Zentinelle with Astrolift**, press **Connect**. The confirm page asks for the **Astrolift organization (slug)**: the first organization's slug is the deployment name unless you changed it. Press **Connect** again to queue the job. It runs inside your account:

1. mints a one-time enrollment code in this Zentinelle, valid for 15 minutes and good once;
2. runs Astrolift's `manage.py connect_zentinelle --org <slug> --url https://zen.<domain>` as a one-off task from Astrolift's bootstrap task definition, which exchanges the code for the organization's install credential (kept in Astrolift's database) and turns Astrolift's Zentinelle flags on;
3. adds the organization to the install record;
4. runs Zentinelle's `seed_integration_policies` once, as a one-off task from Zentinelle's bootstrap task definition, for the standalone tenant.

Expected on **History**: the integration job with the message `Zentinelle with Astrolift enabled for organization <slug>; Zentinelle's audit-mode policies seeded`, and a separate `integration-policy-seed` line, `<deployment>: Zentinelle with Astrolift: policies seeded in audit mode by task <task id>`. The seed's own output is in the log group `/ecs/<deployment>-zentinelle/bootstrap`:

```text
created agent_delegation: "Agent delegation" in audit mode
created human_oversight: "Human oversight" in audit mode
created budget_limit: "Monthly budget" in audit mode
```

A failed seed does not undo the connection: the job still succeeds, and its message says why and gives the command to run. **Connect** stays offered, to connect another organization or reconnect one; each run mints a new code. A deployment installed from an air-gap bundle is refused here and connects from Astrolift's Zentinelle settings with a code generated in Zentinelle instead.

## First policy firing

With `ZEN=https://zen.<domain>`, follow [The first policy firing](index.md#the-first-policy-firing): register the test agent, evaluate the deep, sensitive spawn, and read `"action": "alert"` with the two `[Audit]` warnings. Then remove the test agent. The policies are organization-wide in the standalone tenant, the same tenant the enrollment code, and so the Astrolift connection, was made for.

## Undo

1. **The connection.** Under **Integrations**, **Forget** drops the organization from the install record only. Disconnecting it, or rotating its credential, is an Astrolift organization admin's, in Astrolift's Zentinelle settings.
2. **The policies.** They stay until you change or delete them in Zentinelle's console.
3. **The install.** **Teardown** enforces the order: **Zentinelle on the Astrolift cluster** first, then **Zentinelle**, then **Astrolift**. Each is a destroy plan you read and deploy. Then retire the deployment and remove the state store and the Deployment Manager as in [Undo](index.md#undo).

To move Zentinelle back to ECS without removing it: tear down the cluster unit (keep data), set "Where Zentinelle runs" to **Its own ECS services** in Settings, then plan and deploy Zentinelle; the Deployment Manager scales its Temporal, worker, backend and console back up.

## Known blockers

The [common blockers](index.md#known-blockers) apply. For this blueprint in particular:

- **Default app sign-in.** "App sign-in" defaults to **One sign-in for every app** (Envoy Gateway), and Astrolift's plan refuses it unless the Cognito pool, app client and hosted sign-in domain are all named. Name them, or choose **Per-app load balancer sign-in** under Advanced.
- **Cluster placement on real EKS.** IRSA, the load balancer rules, the park phase against ECS and NetworkPolicy enforcement have run on kind only.
