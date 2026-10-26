# Install by blueprint (AWS)

The Calliope AI installer puts a pull-only **Deployment Manager** in your own AWS account. It asks which **blueprint** you want, records your answers, and then plans and applies the Terraform for each product from a console that runs in your account. These pages take Zentinelle from prerequisites to its first policy firing in three blueprints:

| Guide | Card in the setup wizard | Where Zentinelle runs |
|---|---|---|
| [Standalone on ECS](standalone-ecs.md) | **Standalone**, Zentinelle ticked | Its own ECS services, on its own VPC, Aurora cluster, Temporal and load balancer |
| [Inside Astrolift](in-astrolift.md) | **Zentinelle in Astrolift** | Pods on Astrolift's tenant cluster, on Astrolift's network, Aurora cluster and load balancer, with a Temporal of its own |
| [Full stack](full-stack.md) | **The Full loop** (or **Zentinelle in Astrolift, Workbench beside**) | Pods on Astrolift's tenant cluster, beside the Calliope AI Workbench, wired to both with **Enable integrations** |

!!! warning "Not yet validated end to end"
    Written from the installer source at `calliope-installer` main `568eec4` (after release 0.1.57) and Zentinelle main. No step on these pages has been run end to end on a clean AWS account: none of the three blueprints has been applied, verified and torn down there yet, and that acceptance run is still open (calliope-installer#389). The first-policy check (register a test agent, evaluate, read the alert) was run against Zentinelle's API on a local Postgres, not on AWS. Read the [known blockers](#known-blockers) before you start, and expect the console's own messages to be more current than this page.

The Deployment Manager itself, its prerequisites and its console are the same for every product, and the Astrolift documentation covers them in full: [Install by blueprint (AWS)](https://astrolift.dev/operators/blueprints/). This page repeats only what a Zentinelle install needs.

## Before you start

Every blueprint needs:

- **A host for the Deployment Manager.** Linux or macOS with Docker running (Windows through WSL2). It reaches out to Calliope AI and to AWS; nothing reaches in.
- **AWS credentials for the target account**, selected on that host (`AWS_PROFILE`, or `aws sso login` for an SSO session). Setup checks them with `sts:GetCallerIdentity` and refuses to start without usable credentials.
- **A Calliope AI sign-in** with an organization, or permission to create one.
- **A public Route 53 hosted zone.** Zentinelle on its own writes only under its hostname (`zen.<domain>` by default), so the zone can serve other names. A blueprint with Astrolift needs a zone dedicated to the deployment, because Astrolift manages it in full.
- **A deployment name**: lowercase letters, digits and hyphens, at most 16 characters. It prefixes every resource and is chosen once.
- **The AWS CLI, `curl`, `jq` and `openssl`** on the machine you verify from. The first-policy check reads one secret from Secrets Manager, so that identity needs `secretsmanager:GetSecretValue` on `<deployment>-zentinelle-app`.

## Start the Deployment Manager

```bash
export AWS_PROFILE=<profile-for-the-target-account>
curl -fsSL https://install.calliope.ai/install.sh | sh -s -- --dry-run   # prints the command, launches nothing
curl -fsSL https://install.calliope.ai/install.sh | sh
```

The second command ends with:

```text
Setup UI: http://localhost:7080
Open it to finish setup. Follow along: docker logs -f calliope-agent
```

Open `http://localhost:7080` and walk the setup screens: sign in, **Choose what to install** (the card from the guide), **Pick the cloud** (AWS and a region), **Pick a footprint**, **Review the drawing**, **What we need from you**, **Before we start**, and **Setup complete** with **Open the Deployment Manager**. Each guide says what its card presets and which values it asks for. The screens are described one by one in [The setup screens](https://astrolift.dev/operators/blueprints/#the-setup-screens).

## Apply from the console

The console has five pages: **Status**, **Install**, **History**, **Agent** and **Teardown**. Each blueprint is one or more **units**, each with its own Terraform state.

1. On a fresh deployment the first control on **Install** is **Create state store**. It creates the deployment's S3 bucket and DynamoDB lock table in your account. Until it has run, every dry run is refused with a sentence naming the bucket and lock table.
2. For each unit, in the order the guide gives: press **Dry run** on the unit's **Plan** row (for example **Plan Zentinelle**), read the plan, then press **Deploy** on that unit's row. Deploy applies exactly the plan it was drawn for; a plan older than 24 hours is refused, so dry run it again. A plan that deletes or replaces a stateful resource is drawn in red and needs a second confirmation.
3. **History** keeps every job, including the one-off tasks Enable integrations runs; `?job=<id>` shows one in full.

## The first policy firing

Every guide ends with a test agent registering in Zentinelle's standalone tenant (`00000000-0000-0000-0000-000000000001`) and one evaluation making the delegation and oversight policies fire. Zentinelle's `seed_integration_policies` command creates the missing organization-wide defaults for the selected integration:

| Policy | Type | Settings | Integration |
|---|---|---|---|
| Agent delegation | `agent_delegation` | `max_delegation_depth` 3 | Astrolift and Workbench |
| Human oversight | `human_oversight` | approval required for `high_cost` and `sensitive_data` | Astrolift and Workbench |
| Monthly budget | `budget_limit` | 500 USD a month, alert at 80 percent, no hard limit | Workbench only |

Each is in **audit** mode with the **alert** action: a match is recorded and alerted, and nothing is blocked, even after a policy is switched to enforce. On the Astrolift blueprints, **Enable integrations** runs the command for you; on Zentinelle alone you run it once by hand. A type the tenant already has a policy of is skipped, so running it again changes nothing. Astrolift creates no default monetary budget and does not delete or change any existing policy, including historical or operator-created budgets. Workbench and standalone instructions using `--source workbench` retain their own defaults.

### Register a test agent

Registration takes a bootstrap token, `bt_<tenant>_<hex HMAC-SHA256 of the tenant id, keyed with ZENTINELLE_BOOTSTRAP_SECRET>`. The secret is in the deployment's app secret in Secrets Manager:

```bash
export DEPLOYMENT=<deployment> REGION=<region>
export ZEN=https://zen.<domain>     # Zentinelle's URL; the guide says which
TENANT=00000000-0000-0000-0000-000000000001

SECRET=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$DEPLOYMENT-zentinelle-app" --query SecretString --output text \
  | jq -r .ZENTINELLE_BOOTSTRAP_SECRET)
SIG=$(printf %s "$TENANT" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.*= //')

KEY=$(curl -fsS -X POST "$ZEN/api/zentinelle/v1/register" \
  -H "X-Zentinelle-Bootstrap: bt_${TENANT}_${SIG}" -H 'Content-Type: application/json' \
  -d '{"agent_id":"first-policy-check","name":"First policy check","agent_type":"langchain"}' \
  | jq -r .api_key)
echo "${KEY:0:12}..."
```

Expected: `sk_agent_...`. The registration answer also lists the tenant's policies under `policies`, each seeded default with `"enforcement": "audit"` and `"action": "alert"`. Keep `$KEY` in this shell only; it is the agent's credential.

### Make a policy fire

Ask Zentinelle about an agent spawn that is nine hops deep and touches sensitive data:

```bash
curl -fsS -X POST "$ZEN/api/zentinelle/v1/evaluate" \
  -H "X-Zentinelle-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"agent_id":"first-policy-check","action":"agent:spawn","user_id":"operator",
       "context":{"has_sensitive_data":true,"delegation_depth":9,"parent_agent_id":"first-policy-parent"}}' \
  | jq '{decision, allowed, enforcement: .enforcement | {action, mode, rule: .rule.name}, warnings}'
```

Expected:

```json
{
  "decision": "allow",
  "allowed": true,
  "enforcement": {
    "action": "alert",
    "mode": "audit",
    "rule": "Agent delegation"
  },
  "warnings": [
    "[Audit] Agent delegation: Delegation depth 9 exceeds maximum of 3 allowed by policy 'Agent delegation'. Agent spawn chain is too deep.",
    "[Audit] Human oversight: Human approval required for: sensitive_data. Surface this to a human approver and retry with a valid approval_token."
  ]
}
```

That is the first policy firing: two policies matched, the decision is `alert`, and the call is still allowed. The full answer's `policies_evaluated` shows `Agent delegation` and `Human oversight` with `"result": "fail"` and `"action": "alert"`. A Workbench-seeded `Monthly budget` also appears with `"result": "pass"`. The evaluation is recorded as an event in the alert category, which the console shows once you can sign in to it.

### Remove the test agent

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' -X POST "$ZEN/api/zentinelle/v1/deregister" -H "X-Zentinelle-Key: $KEY"
```

Expected: `204`. The endpoint is marked terminated and its key stops working. The seeded policies stay; change their mode or action, or delete them, in the console's policies page.

## Undo

Use **Teardown**, never a local `terraform destroy`. Each unit offers **keep data** and **with data**; every teardown needs the deployment name typed, and destroying data also needs `destroy data` typed. A teardown is a destroy plan you read and then deploy. The tab enforces the removal order. Once every unit has had a **with data** teardown deployed, it offers **Retire this deployment**, which frees the seats and revokes the Deployment Manager's key. The last steps are yours: the state store bucket and lock table, then the Deployment Manager itself (`docker rm -f calliope-agent`, then `docker volume rm calliope-data`). The full sequence is [Undo](https://astrolift.dev/operators/blueprints/#undo) in the Astrolift documentation.

## Known blockers

Read in the installer and Zentinelle source; each one can stop a clean-account run before the first policy fires.

- **Your Deployment Manager may predate these pages.** The state store control and the Astrolift administrator and sign-in fields landed on installer main after release 0.1.57. If **Install** shows no **Create state store** on a fresh deployment, the image you are running is older, and the first dry run has no state store to initialize against; the [Astrolift known blockers](https://astrolift.dev/operators/blueprints/#known-blockers) describe that release.
- **No first Zentinelle console user.** The Zentinelle unit sets `AUTH_MODE` to `local` and no unit creates a user, so the console at `zen.<domain>` has nobody who can sign in. The API steps above do not need one. [Standalone on ECS](standalone-ecs.md#sign-in-to-the-console) gives a one-off task that runs `createsuperuser`; it has not been run on AWS.
- **Alerts have nobody to notify yet.** An alert notifies the tenant's owners; with no console user there are none, so the alert is recorded but no one is told.
- **Astrolift's default app sign-in needs a Cognito pool** (Astrolift blueprints only). "App sign-in" defaults to one sign-in for every app (Envoy Gateway), and Astrolift's input contract refuses that without a Cognito pool. Name the **Cognito user pool**, **Cognito app client** and **Hosted sign-in domain** together under **Astrolift administrator and sign-in**, or choose **Per-app load balancer sign-in** under Advanced.
- **Zentinelle on the cluster is certified on kind only.** IRSA, the load balancer rules, the park phase against ECS and NetworkPolicy enforcement have not run on real EKS.
- **The Workbench integration is refused on the Full loop.** See [Full stack](full-stack.md#known-blockers).

## Related

- [Deployment Guide](../wiki/Deployment-Guide.md): Docker Compose, the production environment variables, and running Zentinelle without the installer.
- [Policy Reference](../wiki/Policy-Reference.md): every policy type and its settings.
- [API Reference](../wiki/API-Reference.md): `register`, `evaluate`, `deregister` and the rest of the agent contract.
