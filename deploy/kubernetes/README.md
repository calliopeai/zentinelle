# Cluster-local gateway

The Zentinelle gateway deployed into a cluster the agents run in, so that
governance is a property of the network rather than of each agent's
configuration.

```
┌─ cluster ─────────────────────────────────────────────┐
│  agent pods ──8742──▶ zentinelle-gateway ──▶ provider │
│      │                        │                        │
│      └── :443 to providers    └── policy, keys,        │
│          denied by policy         filtering, traces    │
└───────────────────────────────┼───────────────────────┘
                                ▼
                     Zentinelle service (one, many clusters)
```

## Apply

```bash
kubectl apply -f gateway.yaml

# This cluster's gateway credential, minted where the Zentinelle backend runs
# (for example `docker compose exec -T backend python manage.py ...`) and piped
# straight into the Secret, so it never appears on screen.
kubectl create secret generic zentinelle-gateway-credential -n zentinelle \
  --from-literal=credential="$(python manage.py gateway_credential register \
    prod-us-east-1 --cluster prod-us-east-1 --tenant acme-corp --plain)"

kubectl apply -f network-policy-cilium.yaml    # or -vanilla, see below
kubectl label pod -n agents -l app=my-agent zentinelle.ai/governed=true
```

Edit the ConfigMap in `gateway.yaml` first: `ZENTINELLE_URL`,
`ZENTINELLE_TENANT_ID` and `ZENTINELLE_CLUSTER_ID`. The gateway pods wait for
the Secret, then read the credential from `/var/run/zentinelle/gateway-credential`.
Provider keys are stored per tenant in Zentinelle, so neither the gateway nor
any agent holds one.

### One credential per gateway

Each cluster's gateway is registered on the control plane with the tenants it
serves (`--tenant`, repeatable), and Zentinelle releases a tenant's stored
provider key only to a gateway registered for that tenant. A leaked cluster
therefore exposes that cluster's tenants and no others, and is revoked on its
own. The backend keeps only a hash of the credential and needs no copy of it.

```bash
python manage.py gateway_credential list                          # never shows a credential
python manage.py gateway_credential scope prod-us-east-1 --tenant acme-corp --tenant globex
python manage.py gateway_credential revoke prod-us-east-1        # the whole gateway
```

To rotate, mint a second credential and replace the Secret's value with it.
Both work meanwhile. Revoke the first once the pods have the new file, which
the kubelet delivers within a minute or two:

```bash
kubectl create secret generic zentinelle-gateway-credential -n zentinelle \
  --from-literal=credential="$(python manage.py gateway_credential mint prod-us-east-1 --plain)" \
  --dry-run=client -o yaml | kubectl apply -f -
python manage.py gateway_credential revoke prod-us-east-1 --credential sk_gateway_XXXXXXXX
```

A pod still holding the first credential when it is revoked reads its file
again on the refusal, at most once every ten seconds, and retries with the new
one, so nothing restarts.

### Deprecated: env provider keys

`ALLOW_ENV_PROVIDER_KEYS: "true"` plus one `PROVIDER_KEY_<NAME>` per provider
still works for a single-tenant cluster, from a Secret you add to `envFrom`,
and logs a deprecation warning at startup. It will be removed: store the keys
per tenant in Zentinelle instead.

## The label is the enrolment

The egress policy selects `zentinelle.ai/governed: "true"`. A pod without that
label is not governed — NetworkPolicy denies nothing to a pod no policy
selects. Worth an audit query rather than an assumption: an unlabelled agent
pod is one that can still call a provider directly.

## Which policy file

| CNI | File | Note |
|---|---|---|
| Cilium | `network-policy-cilium.yaml` | Matches egress by DNS name. Preferred |
| Calico | adapt the Cilium one | `GlobalNetworkPolicy` has equivalent DNS support |
| Anything else | `network-policy-vanilla.yaml` | No hostname matching; read its header |

The vanilla policy still stops a direct provider call, because a selected pod
is denied everything no rule allows. What it cannot do is express "these
providers are fine and nothing else is", so any other outside destination an
agent legitimately needs has to be listed by CIDR, and CIDRs go stale quietly.

## What the gateway does once traffic reaches it

Policy is evaluated before the request is forwarded, and again on the response
when the tenant has an output filter — in which case the response is buffered
and nothing reaches the caller until the filter has seen all of it. Provider
keys come from Zentinelle, per tenant and only for the tenants this cluster's
gateway is registered for, and live only in the gateway's memory (cached for a
minute), never in any agent, so an agent that somehow reached a provider
directly would have nothing to authenticate with. A provider key an agent
sends is dropped rather than forwarded.

`/metrics` is Prometheus text format on the same port, unauthenticated, for
in-cluster scraping only. The Deployment carries the usual scrape annotations.

## Two settings worth deciding rather than inheriting

`FAIL_OPEN=false` refuses requests when Zentinelle is unreachable. In a
cluster whose purpose is that agents cannot route around governance,
fail-open is the setting that quietly undoes it — and it is also the setting
that keeps agents working through an outage. Decide per cluster.

`LOG_INTERACTIONS=true` sends prompt and completion text to the Zentinelle
service, which is usually outside this cluster. Policy still runs with it off;
what is lost is the reasoning trace.
