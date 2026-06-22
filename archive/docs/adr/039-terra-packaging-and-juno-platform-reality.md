# ADR-039: Terra packaging corrected to the platform reality; one deploy path, one rehearsal, the secret and TLS stacks are ours

**Status:** Accepted. The packaging restructure is landed and CI-verified (the five charts live under `plugins/<workload>/`, lint and template green, `check:env` clean, the bundle rewritten to the real Terra schema). A Juno-shaped kind rehearsal (2026-06-15, [../runbooks/juno-local-rehearsal.md](../runbooks/juno-local-rehearsal.md)) then proved the substrate: the platform is arm64-native and light, ArgoCD GitOps works, all five charts apply on k8s 1.36 and pass ingress-nginx admission, cert-manager + a ClusterIssuer issues TLS from each chart's Ingress, dotted Helm parameters reach nested values, the pull-secret-before-workload requirement is demonstrated, and the full Genesis + Terra control plane stands up locally with no credentials. What remains designed-not-proven is the credentialed Cormac-on-Genesis path (private-repo Source, GHCR pull, ESO, bundle launch) and the capture-to-audit smoke against managed Supabase, tracked in the open items.
**Date:** 2026-06-14 (rehearsal results 2026-06-15)
**Related:** Corrects the Terra-packaging and local-rehearsal portions of ADR-038 (supersedes ADR-038 section 6 "the chart is the plugin in place" and its rejection of a `plugins/` wrapper; amends ADR-038 section 1 "k3d is the local environment / byte-identical to Juno", section 3 cert-manager/ingress assumptions, and the two-track helm-fallback framing). Confirms and sharpens ADR-037 (ESO + Infisical is the secret authority, now established as fully Cormac-owned because Juno ships no secret operator). Realizes ADR-017 (Juno preferred, kept swappable) and ADR-003/005 (managed Supabase external; the runtime holds no DB credentials). Evidence: a verified research pass over the public `juno-fx` repos (`Terra-Official-Plugins`, `juno_k3s`, `Juno-Bootstrap`, `Orion-Deployment`, `Genesis-Deployment`, `EKS-Deployment`, `Helios`, `Helios-AI`), with the five load-bearing claims run through an adversarial verification pass.

## Context

ADR-038 packaged the Juno deployment from the public docs and one stated assumption: that a Terra plugin could be "the chart in place", a `terra.yaml` dropped inside each `deploy/helm/<workload>/` directory with no `plugins/` wrapper, and it explicitly rejected a `plugins/` layout as duplication. It also named the one real Terra unknown (plugin discovery path and field injection) and carried a direct `helm install` fallback so an onboarding deploy could never stall on resolving that unknown. Several "the platform may provide this" assumptions rode alongside (a cert-manager ClusterIssuer might exist; an ESO SecretStore might be platform-provisioned), and local rehearsal ran on plain k3d, asserted as byte-identical to Juno.

A research pass over the actual `juno-fx` source resolved the unknowns and refuted some of the assumptions. The findings that move this decision:

1. **Terra discovery is rigid.** Plugins load only from a `plugins/` directory at the root of the registered Source repo; every plugin needs a `terra.yaml`. Three independent proofs: `docs/repositories.md`, the hardcoded `path: ./plugins/{{ .Values.plugin }}/` in the Application template, and `AGENTS.md` ("Do not create plugins outside this directory"). The chart-in-place layout is never discovered.
2. **Terra is ArgoCD GitOps.** Terra creates one ArgoCD Application per plugin pointing at `plugins/<name>/`; ArgoCD syncs the Helm chart. The only literal `helm install` in the catalog bootstraps the tiny Application wrapper, never the plugin chart itself.
3. **Juno ships no secret operator.** A content search across all six platform repos for `external-secrets|secretstore|infisical|sealed-secret|vault|sops` returns zero matches. Juno handles only image-pull secrets (by name), ArgoCD bootstrap secrets, and its own platform-auth credentials as plain Secrets.
4. **Juno ships no cert-manager and no issuer.** It installs ingress-nginx; cert-manager exists only as an optional Terra plugin with no issuer bundled. TLS is entirely operator-supplied.
5. **The AWS pilot is EKS** behind one shared ingress-nginx on one NLB with `proxy_protocol_v2` forced on (TLS terminates in-cluster, not at the LB), and the EKS template defaults to `nat gateway: Disable` (no internet egress).
6. **A Juno project is a Kubernetes namespace** with permissive default isolation, and a Juno-shaped local stack (`Juno-Bootstrap` `make bootstrap`, or `Terra-Official-Plugins` `make test`) reproduces the real ArgoCD-synced topology far more faithfully than plain k3d.

## Decision

### 1. Terra packaging: one chart home under `plugins/`, the bundle at the real schema

The five workload charts move from `deploy/helm/<workload>/` to `plugins/cormac-<workload>/` at the repo root. Each directory is, at once, a Terra plugin (it carries `terra.yaml` beside `Chart.yaml`/`values.yaml`/`templates/`) and a plain Helm chart (`terra.yaml` is inert to Helm). There is no `deploy/helm` and no wrapper or mirrored copy: one directory per workload, one source of truth. The Cormac repo is the Terra Source; Terra scans `plugins/*/terra.yaml` at its root. Two install-time contracts were confirmed on live Terra v2.1.1 (the kind rehearsal) and are load-bearing: (a) the **plugin directory name must equal its `resource_id`**, because Terra builds the install path from `resource_id` (`./plugins/cormac-worker/`), not from the discovered directory; (b) Terra injects each `terra.yaml` field as a **flat top-level Helm value** (via `spec.source.helm.values`), so the charts read flat keys whose names match the fields exactly (`image_tag`, `image_pull_secret`, `ingress_host`, `cluster_issuer`, `recycle_schedule`), never nested `image.tag`/`ingress.host`.

The bundle moves to `bundles/cormac.yaml` at the repo root and uses the verified schema: a top-level `resource_id` (REQUIRED, confirmed by a BundleSchema validation failure when omitted), then plugins referenced by their display `name`, shared bundle fields fanned into each plugin via `values: {<plugin_field>: {reference: <bundle_field>}}`. Inside a bundle, plugins are referenced by `name` (not resource_id); the bundle's own top-level `resource_id` is still required. Per-workload ingress hosts are surfaced as separate bundle fields because a reference maps a value, it does not template `api.` + base.

This supersedes ADR-038 section 6 and its rejection of a `plugins/` layout.

### 2. One deploy path: Terra/ArgoCD GitOps; `helm install` is a property, not a pipeline

The platform-native path is the only maintained deploy path: register the repo as a private Terra Source, Terra creates an ArgoCD Application per plugin, ArgoCD syncs. The direct `helm install` of `plugins/<workload>/` remains *possible* because the plugins are plain Helm charts, which is the ADR-017 swappability property and a debugging convenience and a first-touch bootstrap if Source registration snags. It is not a second pipeline we keep in sync. ADR-038's "two tracks" framing is retired: there is one deploy path and one inherent fallback capability.

### 3. One rehearsal substrate: the Juno-shaped kind stack; retire plain k3d

The pre-onboarding rehearsal runs on a Juno-shaped `kind` stack (`Juno-Bootstrap` `make bootstrap` gives kind + ArgoCD + ingress-nginx + Genesis; `Terra-Official-Plugins` `make test` exercises the true plugin to ArgoCD Application to sync path), with cert-manager added as a deliberate step since neither bootstrap installs it. Plain k3d is demoted to a fast chart-correctness loop and then retired; it never exercised the ArgoCD sync, the ingress-nginx/proxy-protocol topology, or the pull-secret ordering, so "k3d is byte-identical to Juno" (ADR-038 section 1) does not hold. The daily code loop is unchanged and uses no cluster (host dev servers against managed Supabase). The kind stand-up and the k3d retirement land with the rehearsal step (open item 1); until then the k3d scripts remain so the tree never claims a capability it lacks.

### 4. Secrets: ESO + Infisical is fully Cormac-owned

Juno provides no in-cluster application-secret mechanism, so ADR-037's ESO + Infisical is not one option among platform alternatives, it is the only mechanism and it is entirely ours. We install the External Secrets Operator ourselves as a cluster-level concern (a Terra cluster-level plugin, the same pattern Juno uses to ship cert-manager, or our own ArgoCD Application), with one namespaced SecretStore in the `cormac` namespace syncing Infisical into one `cormac-secrets` Secret consumed by `secretKeyRef`. The "platform may provision the SecretStore" framing (carried in the old `deploy/terra/README.md`) is dropped.

### 5. TLS: we own the whole stack

For the pane's stable custom domain and the api/web ingresses, we own TLS end to end. Install the cert-manager Terra plugin (cluster-level), create our own ClusterIssuer (Let's Encrypt, Route53 DNS-01 on the AWS pilot), and optionally run ExternalDNS to manage the Route53 records. Juno supplies neither cert-manager nor an issuer. This amends ADR-038 section 3, which treated the ClusterIssuer as something the platform might supply.

### 6. Networking: shared ingress-nginx, annotations not load balancers

The pilot fronts everything with one shared ingress-nginx behind one AWS NLB with `proxy_protocol_v2` on, TLS terminating in-cluster. There are no per-chart load balancers. `ingress-noauth` (the api public webhook door) versus `ingress-auth` (web) are ingress-nginx annotations on the shared controller, not separate LBs. The api webhook ingress explicitly drops any Genesis `auth-url` annotation (the platform default is authenticated ingress); webhooks are verified in-app, which is a documented, deliberate deviation. Charts must carry no ALB/ACM-on-LB or LB-terminated-TLS assumptions.

### 7. Cluster egress is a hard prerequisite

Cormac needs outbound internet for ESO to reach Infisical SaaS, for GHCR private image pulls, and for managed Supabase over the network. The EKS template defaults to no egress. The pilot cluster must be created with a NAT gateway (Single for dev, HighlyAvailable for prod) or with VPC endpoints sufficient for those three dependencies. This is a cluster-creation gate, confirmed before onboarding, with an egress reachability check in the rehearsal smoke.

### 8. Namespace model and the dev workspace

A Juno project is a Kubernetes namespace; Cormac deploys into one `cormac` namespace (ArgoCD `CreateNamespace=true`). Default isolation is permissive, so we bring our own NetworkPolicy/RBAC. Cluster-level operators we install (ESO, cert-manager) live in the argocd namespace and manage their own. The dev workspace (Jarvis) maps to official Juno plugins, a Helios/Helios-AI workstation customized with our toolchain through rootfs/event hooks, plus gitea and (for the local-model ask) ollama, all dev-only and never touching client data. Helios-AI is a browser XFCE workstation with no LLM in it, structurally distinct from our headless `hermes-runtime` product image, so the Jarvis/product boundary (ADR-017) holds.

## Consequences

- The Terra-native path is now real and designed to the verified contract, with `helm install` retained as an inherent fallback. The packaging restructure is CI-verified; the ArgoCD-synced behavior is proven at the kind rehearsal.
- Three "platform may provide" assumptions are removed: ESO, cert-manager/issuer, and a friendly egress default. Each becomes Cormac-owned work or an explicit onboarding gate, which is a more honest picture of what the pilot costs us.
- One deploy path and one rehearsal substrate reduce the moving parts. The cruft of two local environments and a maintained second deploy pipeline is gone.
- The security packet gains the add-in deployment/pane-sandbox section eventually and keeps its claims true: the control plane is still the only writer, the runtime still holds no DB credentials, managed Supabase is still the external system of record, and Juno is still swappable because every chart is plain Kubernetes.
- A new onboarding-questions set (private-repo Source auth, pull-secret seeding sequence, egress, DNS delegation, version pins) replaces the looser cluster-facts list.

## Alternatives considered

**Keep the chart-in-place layout and register `deploy/helm` as the Source path.** Rejected: Terra's discovery is `plugins/*/terra.yaml` at the repo root and the Application path is hardcoded to `./plugins/<name>/`, so a non-`plugins/` location is never discovered. The old ADR-038 framing assumed a path override that the source does not support.

**Generate a `plugins/` tree from `deploy/helm/` (the gen:env pattern), or thin delegating Application charts that point back at `deploy/helm/`.** Both keep two directories for one thing. Rejected in favor of a single chart home under `plugins/`: one directory that is both the plugin and the Helm chart, no generator, no wrapper, no duplication. The duplication ADR-038 feared is avoided by having one location, not by avoiding `plugins/`.

**Keep the direct `helm install` fallback as a maintained second pipeline.** Rejected: it existed only to de-risk Terra while the plugin contract was unknown, and the contract is now known. The charts being plain Helm means `helm install` stays available without maintaining a parallel pipeline.

**Keep plain k3d as the rehearsal.** Rejected: it does not exercise the ArgoCD sync, ingress-nginx/proxy-protocol, or pull-secret ordering, so it cannot prove the platform-native path. The Juno-shaped kind stack reproduces the real topology and is the rehearsal of record.

**Adopt a platform secret mechanism instead of ESO.** Rejected because there is none; Juno provides no secret operator. ESO + Infisical is necessary, not optional.

## Open items

1. **The Juno-shaped kind rehearsal.** Substrate and Terra-native path proven (2026-06-15, [../runbooks/juno-local-rehearsal.md](../runbooks/juno-local-rehearsal.md)): kind + ArgoCD + ingress-nginx + cert-manager + a ClusterIssuer; full Genesis + Terra (genesis v5.1.0 / terra v2.1.1) running locally, arm64-native, no credentials; the private repo registered as a real Terra Source; all five plugins discovered and their `terra.yaml` parsed; the bundle loaded after the `resource_id` fix; ESO -> `cormac-secrets` synced; the pull-secret-before-workload requirement demonstrated. Remaining: pods actually running (blocked locally because CI images are amd64-only and the kind cluster is arm64; runs on amd64 Juno) and the capture-to-audit smoke against managed Supabase, plus the EKS egress check. Retire the k3d scripts once a committed kind-based dev/rehearsal script replaces `pnpm dev`.
2. **Field-to-values injection: RESOLVED.** Terra injects each field as a FLAT top-level Helm value via `spec.source.helm.values` (observed: `image_tag: dev`), not as nested `image.tag` and not via `helm.parameters`. It also builds the install path from `resource_id`, so the plugin directory must be named `plugins/cormac-<workload>/`. Both fixed: the charts now read flat operator keys and the directories were renamed to match resource_id.
3. **Private-repo Source registration: RESOLVED.** Terra's Add Source form takes the repo Username + Password/Token directly (it stores the credential itself), so no pre-created ArgoCD repo secret is needed for the Terra-native path. The PAT is then embedded in the generated ArgoCD Application's repo URL, so the rehearsal PAT should be revoked after use.
4. **Onboarding confirmations:** the GHCR pull-secret seeding sequence on the managed cluster, the EKS egress posture, DNS delegation and ExternalDNS for the pane host, ClusterIssuer versus the platform's namespaced-Issuer convention, the exact Genesis/Orion/Terra and Hermes versions to pin, and any platform policy on tenant-installed cluster-scoped operators/CRDs.
