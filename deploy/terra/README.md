# Cormac on Juno: the Terra packaging

> **Status:** draft (onboarding prep) · **Last reviewed:** 2026-06-13

This directory is the Juno-specific packaging of the Cormac stack (ADR-036). It is
thin on purpose: the deployable substance is the proven Helm charts in
[../helm/](../helm/), which already ran the walking skeleton end to end on local
k3d (ADR-035). Terra adds a launch UI over those charts; it changes none of them.

## What a Terra plugin is here

Confirmed against the live `juno-fx/Terra-Official-Plugins` repo: **a Terra plugin
is a Helm chart plus a `terra.yaml`** (metadata + an operator `fields` array).
Kuiper renders the plugin's chart with the field values and applies it. A
**bundle** (`bundles/*.yaml`) groups plugins with shared fields.

So each `../helm/<workload>/` chart carries its own `terra.yaml` and **is** a Terra
plugin in place (no duplicate charts). This directory holds only:

- [bundles/cormac.yaml](bundles/cormac.yaml): the five workloads as one launchable unit.

| Plugin (resource_id) | Chart | Network | Notes |
| --- | --- | --- | --- |
| `cormac-api` | [../helm/api](../helm/api) | ingress-noauth | Public webhooks, verified in-app; sole holder of the service key |
| `cormac-web` | [../helm/web](../helm/web) | ingress-auth | Admin/trust/fallback door |
| `cormac-pane` | [../helm/pane](../helm/pane) | ingress-noauth | Static assets, stable custom domain; **gated on ADR-028 GO/NO-GO** |
| `cormac-worker` | [../helm/worker](../helm/worker) | clusterip | No inbound traffic |
| `cormac-hermes-runtime` | [../helm/hermes-runtime](../helm/hermes-runtime) | clusterip | Headless, no DB creds, CronJob recycler |

## Registering as a Terra Source

1. Add this repo as a private Terra Source in Genesis.
2. Terra discovers the plugins (the `terra.yaml` files under `../helm/`) and the
   `cormac` bundle, then launches them into the `cormac` project namespace.
3. Fill the bundle fields (image tag, base domain, ClusterIssuer, pull secret).

Step-by-step deploy, including the **direct-`helm install` fallback that needs no
Terra at all**, is in [../../docs/runbooks/deploy-to-juno.md](../../docs/runbooks/deploy-to-juno.md).

## The one structural unknown (confirm at onboarding)

The public Terra record shows plugins under a `plugins/` directory at the Source
root and gives no example of a plugin pointing at a prebuilt GHCR image (the
official plugins are build-from-repo or app installs). Two things to confirm with
the Juno team, neither of which blocks the deploy because the fallback is direct
`helm install`:

1. **Plugin discovery path.** Does Terra scan an arbitrary path (our `terra.yaml`
   files live under `../helm/`) or require a `plugins/` root? If the latter, the
   fix is a `plugins/` directory of file-dependency shims pointing at `../helm/`,
   or registering `deploy/helm` as the Source path. A 5-minute restructure, not a
   redesign.
2. **field → values injection.** How a `terra.yaml` field sets a chart value
   (e.g. `ingress_host` → `ingress.host`). The deterministic path the fallback
   uses is `helm install --set`, which does not depend on this.

## Cluster-facts to fill at onboarding

These are real operator inputs, not placeholders. They are unknown only because
they are facts about the pilot cluster we do not have yet:

| Fact | Sets | Onboarding question |
| --- | --- | --- |
| Image tag (commit sha) | `image.tag` | Which CI build to deploy |
| Base domain | `ingress.host` (api/web/pane) | DNS delegation for hosts we own |
| ClusterIssuer name | `ingress.tls.clusterIssuer` | Does a `cert-manager` ClusterIssuer exist (else CDN for the pane) |
| Pull secret | `imagePullSecret` | Create the GHCR docker-registry Secret BEFORE deploy (juno_k3s race) |
| Secret backend | the `cormac-secrets` Secret | ESO `SecretStore` provisioned (preferred), or plain Secret |

Trust rules survive the move unchanged (the control plane is the only writer; the
runtime has no public route and no DB credentials; managed Supabase is the system
of record). See [../../docs/prd/juno-platform-pilot.md](../../docs/prd/juno-platform-pilot.md)
for the full local↔Juno mapping.
