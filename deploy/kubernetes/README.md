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
kubectl apply -f network-policy-cilium.yaml    # or -vanilla, see below
kubectl label pod -n agents -l app=my-agent zentinelle.ai/governed=true
```

Edit the ConfigMap and Secret in `gateway.yaml` first — `ZENTINELLE_URL`,
`ZENTINELLE_TENANT_ID`, `ZENTINELLE_CLUSTER_ID`, and one
`PROVIDER_KEY_<NAME>` per provider the cluster may reach.

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
keys live in the Secret above rather than in any agent, so an agent that
somehow reached a provider directly would have nothing to authenticate with.

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
