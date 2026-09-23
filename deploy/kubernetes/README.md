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

# The gateway token: one random value, generated here and never committed.
# Skipped when it exists, so re-running never rotates it by accident.
kubectl get secret zentinelle-gateway-token -n zentinelle >/dev/null 2>&1 ||
  kubectl create secret generic zentinelle-gateway-token -n zentinelle \
    --from-literal=token="$(openssl rand -hex 32)"

kubectl apply -f network-policy-cilium.yaml    # or -vanilla, see below
kubectl label pod -n agents -l app=my-agent zentinelle.ai/governed=true
```

Edit the ConfigMap in `gateway.yaml` first: `ZENTINELLE_URL`,
`ZENTINELLE_TENANT_ID` and `ZENTINELLE_CLUSTER_ID`. The gateway pods wait for
the Secret, then read the token from `/var/run/zentinelle/gateway-token`.
Provider keys are stored per tenant in Zentinelle, so neither the gateway nor
any agent holds one.

### Give the backend the same token

The gateway presents the token and the backend checks it, so both need the
one value.

- **Backend in this cluster:** mount the same Secret the same way. The backend
  reads `/var/run/zentinelle/gateway-token` by default, on every lookup, so a
  rotated Secret reaches it without a restart. Secrets are namespaced: create
  it in the backend's namespace too, with the same value.

  ```yaml
  # in the backend Deployment's pod spec
  volumes:
    - name: gateway-token
      secret:
        secretName: zentinelle-gateway-token
        items: [{key: token, path: gateway-token}]
  containers:
    - name: backend
      volumeMounts:
        - {name: gateway-token, mountPath: /var/run/zentinelle, readOnly: true}
  ```

- **Backend elsewhere** (ECS, compose, another cluster): put the value in the
  secret store its `ZENTINELLE_GATEWAY_TOKEN` comes from, reading it with
  `kubectl get secret zentinelle-gateway-token -n zentinelle -o jsonpath='{.data.token}' | base64 -d`.

The token reads the stored provider key of any tenant whose agent key it is
presented with, so this is a Secret to guard like one: only the gateway and
the backend mount it.

To rotate, replace the Secret's value in both places. The gateway reads its
file again when the backend refuses the old token, at most once every ten
seconds; the kubelet takes up to a minute or so to update a mounted Secret.

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
keys come from Zentinelle, per tenant, and live only in the gateway's memory
(cached for a minute), never in any agent, so an agent that somehow reached a
provider directly would have nothing to authenticate with. A provider key an
agent sends is dropped rather than forwarded.

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
