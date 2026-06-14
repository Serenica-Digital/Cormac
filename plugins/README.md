# Cormac plugins (Helm charts and Terra packaging)

> **Status:** canonical · **Last reviewed:** 2026-06-14

The deployment artifacts for Juno (ADR-017, ADR-037, ADR-039). Each `plugins/<workload>/`
directory is one thing in two readings: a **Terra plugin** (it carries `terra.yaml`
beside `Chart.yaml`/`values.yaml`/`templates/`) and a **plain Helm chart** (`terra.yaml`
is inert to Helm). Terra discovers plugins only from `plugins/*/terra.yaml` at the
Source repo root, so this is where they live; there is no `deploy/helm` and no
wrapper or mirrored copy. Charts are plain, portable Kubernetes, so Juno stays
swappable. The bundle is at [../bundles/cormac.yaml](../bundles/cormac.yaml).

The per-workload `env`/`secretEnv` in each chart's `values.yaml` are kept in
lockstep with the env manifest (`packages/config`) by `pnpm check:env`. Change a
variable there, not only here.

## Workloads

| Plugin | Image | Network | Notes |
| --- | --- | --- | --- |
| `api` | `ghcr.io/serenica-digital/api` | ingress-noauth | Public webhooks (in-app verification); sole holder of the Supabase service key |
| `web` | `ghcr.io/serenica-digital/web` | ingress-auth | Admin/trust/fallback door; VITE_* baked at build |
| `pane` | `ghcr.io/serenica-digital/pane` | ingress-noauth | Static assets on a **stable custom domain + TLS** (manifest-pinned); gated on ADR-028 GO/NO-GO |
| `worker` | `ghcr.io/serenica-digital/worker` | clusterip | No inbound traffic |
| `hermes-runtime` | `ghcr.io/serenica-digital/hermes-runtime` | clusterip | Never publicly routable; no DB creds; CronJob recycler for the upstream leak (#25315) |

`clusterip` means the chart renders a Service and **no Ingress**. `ingress-noauth`
vs `ingress-auth` are ingress-nginx annotations on the one shared controller, not
separate load balancers (ADR-039).

## How Terra deploys these

Terra is GitOps over ArgoCD. Register this repo as a private Terra Source in
Genesis; Terra discovers `plugins/*/terra.yaml` and the `cormac` bundle, creates
one ArgoCD Application per plugin pointing at `plugins/<name>/`, and ArgoCD syncs
the chart into the `cormac` namespace. Bundle fields fan into each plugin's fields
by reference. There is one deploy path (Terra/ArgoCD); a plain `helm install
plugins/<workload>` still works because these are ordinary Helm charts, which is
the portability escape hatch (ADR-017), not a second maintained pipeline.

```sh
# Render / lint without a cluster:
helm template cormac plugins/api -f plugins/values.example.yaml
helm lint plugins/*/

# Ad hoc install of one chart (portability / debug), secrets created first:
helm install cormac-api plugins/api -n cormac \
  -f plugins/values.example.yaml \
  --set ingress.host=api.<your-domain> --set image.tag=<sha>
```

## Secrets (Cormac-owned)

No image or chart default holds a secret. Every secret injects at runtime via
`secretKeyRef` from one k8s Secret, `cormac-secrets`. Juno ships **no** secret
operator (ADR-039), so the External Secrets Operator + Infisical SecretStore is
entirely ours: we install ESO as a cluster-level concern and a namespaced
SecretStore syncs Infisical into `cormac-secrets`. The GHCR pull secret and
`cormac-secrets` must exist in the namespace **before** the workloads sync (the
juno_k3s race). Bootstrap shape in [secrets.example.yaml](secrets.example.yaml);
rotation and generation in [../docs/runbooks/secrets-and-env.md](../docs/runbooks/secrets-and-env.md).

## TLS for the pane (Cormac-owned)

Juno installs ingress-nginx but no cert-manager and no issuer (ADR-039). We install
the cert-manager Terra plugin and create our own ClusterIssuer (Let's Encrypt,
Route53 DNS-01 on the AWS pilot), optionally with ExternalDNS for the pane host.
TLS terminates in-cluster at ingress-nginx, behind one NLB with `proxy_protocol_v2`.

## Confirm at the Juno onboarding session

Operator facts about the pilot cluster we do not have yet (full set and the
genuinely-open questions are in [ADR-039](../docs/adr/039-terra-packaging-and-juno-platform-reality.md)):

1. **Private-repo Source auth**: how Terra/ArgoCD authenticates to this private Source.
2. **Cluster egress**: NAT gateway or VPC endpoints for Infisical, GHCR, and managed Supabase (the EKS template defaults to none).
3. **Pull-secret seeding sequence** so the GHCR secret precedes the first ArgoCD sync.
4. **DNS delegation + ClusterIssuer** for the api/web/pane hosts (or our own ExternalDNS).
5. **Hostname stability** across platform updates (the api webhook URL and the manifest-pinned pane URL).
6. **Versions to pin** (Genesis/Orion/Terra and the Hermes build) and any policy on tenant-installed cluster-scoped operators (ESO, cert-manager).
