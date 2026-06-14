# Cormac Helm charts (Juno workload templates)

> **Status:** canonical · **Last reviewed:** 2026-06-13

The deployment artifacts for Juno (ADR-017, ADR-037/038). One Helm chart per workload;
each is a Terra workload template that runs a CI-built image from this repo (not
Juno's build-from-repo runtime plugins, which do not fit a pnpm monorepo). Charts
are plain, portable Kubernetes, so Juno stays swappable.

The per-workload `env`/`secretEnv` in each chart's `values.yaml` are kept in
lockstep with the env manifest (`packages/config`) by `pnpm check:env`. Change a
variable there, not only here.

## Workloads

| Chart | Image | Network | Notes |
| --- | --- | --- | --- |
| `api` | `ghcr.io/serenica-digital/api` | ingress-noauth | Public webhooks (in-app verification); sole holder of the Supabase service key |
| `web` | `ghcr.io/serenica-digital/web` | ingress-auth | Admin/trust/fallback door; VITE_* baked at build |
| `pane` | `ghcr.io/serenica-digital/pane` | ingress-noauth | Static assets on a **stable custom domain + TLS** (manifest-pinned); VITE_* baked at build |
| `worker` | `ghcr.io/serenica-digital/worker` | clusterip | No inbound traffic |
| `hermes-runtime` | `ghcr.io/serenica-digital/hermes-runtime` | clusterip | Never publicly routable; no DB creds; CronJob recycler for the upstream leak (#25315) |

`clusterip` here means the chart renders a Service and **no Ingress** (we control
that in our own templates, so PR #557's `network_mode` is not a dependency).

## Secrets

No image or chart default holds a secret. Every secret is injected at runtime via
`secretKeyRef` from one k8s Secret, `cormac-secrets`. Create it (and the GHCR pull
secret) **before** deploy: see [secrets.example.yaml](secrets.example.yaml). On
Juno, an External Secrets Operator `ExternalSecret` can synthesize the same Secret
from Vault / AWS Secrets Manager / Azure Key Vault. Rotation and generation are in
[../../docs/runbooks/secrets-and-env.md](../../docs/runbooks/secrets-and-env.md).

## Render / lint / install

```sh
# Render a chart with the shared overrides (no cluster needed):
helm template deploy/helm/api -f deploy/helm/values.example.yaml
helm lint deploy/helm/*/

# Create the secrets first (see secrets.example.yaml), then install per workload:
helm install cormac-api deploy/helm/api -n cormac \
  -f deploy/helm/values.example.yaml \
  --set ingress.host=api.<your-domain> --set image.tag=<sha>
# ...repeat for web, pane, worker, hermes-runtime.
```

Registering as Terra workload templates: add this repo as a private Terra Source;
each `deploy/helm/<workload>` is a parameterized chart Genesis can launch. A
"cormac" bundle can group them with shared install parameters.

## Confirm at the Juno onboarding session

The chart values marked `PLACEHOLDER` ride on documented Juno defaults (ADR-038
risk note). Resolve these operational items, then finalize the values:

1. **Custom domain + TLS for the pane** (load-bearing): can a workload be served on
   a stable host we own (`pane.<domain>`) with a `cert-manager` `ClusterIssuer`?
   If not, front the pane with a CDN (Cloudflare). Confirm the `ClusterIssuer` name.
2. **Secret backend**: is an External Secrets Operator + `SecretStore` provisioned,
   or do we ship plain k8s Secrets? Who can read them back?
3. **CronJob RBAC**: can the recycle CronJob hold the Role/RoleBinding to
   `rollout restart` its Deployment in our namespace?
4. **clusterip / no-public-route** for a custom (non-runtime-plugin) workload.
5. **Hostname stability** across platform updates (the api webhook URL, the pane URL).
6. **Which Hermes build** the pilot runs (whether the post-v0.16.0 leak fix is in).
