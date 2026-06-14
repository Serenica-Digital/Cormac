# ADR-038: One orchestrator, one local-to-prod environment, one backend; the Terra packaging for Juno

**Status:** Accepted. Proven live: the whole backend runs on local k3d from the same Helm charts that deploy to Juno, the walking skeleton passes 11/11 against it with real Hermes, and the managed `APP_ENV=dev` / ES256 posture boots, authenticates, and reads managed Postgres (this closes ADR-035 open item 1). The Juno *cluster* deploy itself is gated on the onboarding session (#15). This is the consolidated end-state of the deployment half of the migration.
**Date:** 2026-06-13
**Related:** Consolidates and supersedes the deployment portions of ADR-034 (the Kubernetes consumption model), ADR-035 (Helm-only, k3d as the local environment), and ADR-036 (the single Supabase backend, the store deletions, the Terra packaging). Those three remain as the granular history; this ADR is what a reader dereferences for "how Cormac is deployed and run now." Companion to ADR-037, which consolidates the environment-and-secrets half. Realizes ADR-017 (Juno preferred, kept swappable). Enforces ADR-003/ADR-005 (managed Supabase is the system of record; the runtime holds no database credentials) and ADR-020 (JWKS-only in production).

## Context

The deployment story moved through four sessions and three intermediate ADRs, each correcting the last. This ADR records the end-state as one decision so it is not reconstructed from a chain of supersessions.

The arc:

1. **No deployment artifacts at all.** The system ran only on `docker-compose` locally; there were zero Kubernetes or Helm artifacts, and the Juno pilot needs them. ADR-034 authored the first Helm charts (one per workload) plus the k8s consumption model.

2. **Compose is a second definition of the system.** Review named the next layer of the same disease: `docker-compose.yaml` and the Helm charts both described the whole topology (the same services, ports, env, dependencies, images) in two formats that drift, which is the orchestration-layer version of "declared in N places." ADR-035 retired compose and made Helm the only orchestrator, run locally on k3d so the charts are exercised on the developer's machine before they ship.

3. **The straddle, and a hidden red CI.** ADR-035 planned for the local k3d stack to talk to the managed dev Supabase, but the live proof to that point had run against *local* Supabase. The system was straddling two backends crammed into one environment, which spawned the `REMOTE_*`/`posture`/`isGatedManaged` artifacts and a `ClusterSecretStore`/dual-`ExternalSecret` split. Review pushed to collapse it. Investigation also found CI had been red since the first migration commit, hidden because the local check ran a test subset that excluded the pane. ADR-036 collapsed the straddle and fixed CI; this ADR carries that end-state.

4. **The Terra packaging.** With the collapse making local k3d byte-identical to Juno, the Juno packaging became thin, and it was authored ahead of the imminent onboarding session ([deploy/terra/](../../deploy/terra/), [deploy-to-juno.md](../runbooks/deploy-to-juno.md)).

## Decision

### 1. Helm is the only orchestrator; k3d is the local environment

`docker-compose.yaml` is retired. Local development runs the same Helm charts under [deploy/helm/](../../deploy/helm/) on a local k3d cluster ([deploy/k3d/](../../deploy/k3d/), `pnpm dev` / `pnpm k3d:down`) that deploy to Juno. The backend (api, worker, hermes-runtime) runs in-cluster; the web and pane frontends run on the host via Vite against the cluster's api, because their `VITE_*` are build-time and the pane needs host HTTPS for sideload. Per-chart `values.local.yaml` overlays carry the local posture (local images, no pull secret, ingress off, no recycle CronJob). Developing *is* running the charts, so "do the charts work" is a continuous fact rather than a one-off proof.

### 2. Managed Supabase is the single backend; local is CI-only

Managed Supabase is the one backend for **human dev, local k3d, and Juno** (`APP_ENV=dev`, ES256/JWKS-only, the fail-closed rules live). **Local Supabase survives only as CI's hermetic test fixture** (`APP_ENV=local`, HS256, values minted by `supabase start` at run time, never in Infisical, never in the app's env model). The integration suites (tenant isolation, RLS, purge) are destructive and want a throwaway Postgres per run, which is the one place a local stack earns its keep. `pnpm db:start` is therefore a CI/offline tool, not the dev-database path; `pnpm dev` (k3d against managed Supabase) is the dev path.

### 3. The Kubernetes consumption model

Secrets are never baked into an image or a chart default. Every secret injects at runtime via `secretKeyRef` from one `cormac-secrets` Secret, synthesized by **one namespaced ESO `SecretStore`** that is identical on k3d and Juno (a `ClusterSecretStore` is only needed to span namespaces, and the deployment uses one `cormac` namespace; the dual local/prod `ExternalSecret` is gone). Private images pull with `imagePullSecret` (a GHCR docker-registry Secret that must exist before deploy, the juno_k3s race). Non-secret config rides in a ConfigMap. `clusterip` workloads (worker, hermes-runtime) render a Service and no Ingress, so the platform's `network_mode` feature is not a dependency; the api is `ingress-noauth` (public webhooks verified in-app); the pane carries a stable custom domain plus `cert-manager` TLS, because the Office add-in manifest pins its URL near-permanently. Charts stay plain, portable Kubernetes, so Juno remains swappable (ADR-017).

### 4. The Hermes runtime operational shape

The runtime carries a memory limit (an OOM-restart backstop) and a CronJob recycler for the upstream leak (#25315), since Juno has no native recycle. A `wait-for-api` init container blocks startup until the control-plane api is reachable, fixing the boot-time race where Hermes loses its one-shot MCP connection. The mid-run reconnect gap (Hermes does not re-establish the connection if the api restarts while it runs) is tracked as a real robustness item (#59). `state.db` is ephemeral on an `emptyDir`: the control plane reads provenance synchronously after each run.

### 5. Two image lanes

CI builds `linux/amd64` images for Juno and publishes them to GHCR on push to `dev`/`main`; local k3d builds `linux/arm64` natively (the developer's Mac) and imports them. The two lanes are deliberate and documented. The upstream Hermes image ships a `linux/arm64` build, so the whole stack runs arm64-native locally with no emulation.

### 6. The Terra packaging for Juno

Because the collapse made local k3d and Juno run the same charts against the same managed backend, the Juno packaging is thin. A Terra plugin is a Helm chart plus a `terra.yaml`, so each `deploy/helm/<workload>/` chart carries its own `terra.yaml` and *is* a Terra plugin in place (no duplicate charts). A `cormac` bundle ([deploy/terra/bundles/cormac.yaml](../../deploy/terra/bundles/cormac.yaml)) groups the five workloads. The deploy runbook ([deploy-to-juno.md](../runbooks/deploy-to-juno.md)) carries two tracks: the Terra-native launch, and a guaranteed direct-`helm install` fallback that depends on nothing Juno-specific, so an onboarding-session deploy is never blocked on resolving Terra's plugin contract live. The genuine onboarding unknowns (Terra's plugin-discovery path and field-to-values injection, the cluster's ClusterIssuer, the secret backend, hostname stability) are documented as confirmations, not blockers.

## Consequences

- One definition of the system's topology, exercised continuously. The green-checkmark-versus-reality gap closes for the deployment: developing on k3d runs the charts.
- k3d is byte-identical to Juno on the charts, in-cluster Service DNS, `secretKeyRef`, and the ESO `SecretStore`; the only deltas are the image lane (arm64 local vs GHCR amd64) and ingress (off local vs on Juno).
- The managed posture is proven, not asserted: seed wrote to the managed project, the api boots under `APP_ENV=dev`, verifies a managed-issued ES256 token via JWKS, and reads managed Postgres.
- The repo arrives at the Juno onboarding with a deployable bundle and a Terra-independent fallback, so the session is "deploy this, fix what breaks," not "figure out what to build."
- Operational note: the managed dev project is Supabase free-tier and pauses after a week of inactivity; resume it before a deploy or smoke.

## Alternatives considered

**Keep compose as the local environment.** Rejected: two orchestrators drift (the original disease one level up), and compose never proves the charts. One orchestrator, run locally on k3d, is both the daily environment and the portability proof.

**Managed Supabase everywhere including CI (Supabase branching).** Rejected: hermetic CI against managed needs branching, a Pro-plan feature (~$25/mo plus per-branch compute), while Supabase's own CI guidance uses free local `supabase start`. Keeping local for CI is free, is what CI already did, and does not reintroduce posture, because CI's database is an internal fixture whose values never enter Infisical or the app's env model.

**Run Postgres in-cluster (own the database).** Rejected: there is no Terra Supabase/Postgres plugin, and it adds a stateful service the architecture deliberately avoids; managed Supabase is the system of record (ADR-003).

**Author wrapper charts under `deploy/terra/plugins/`.** Rejected as duplication. A Terra plugin is a chart plus a `terra.yaml`, so the chart becomes the plugin in place; the only Juno-specific files are five small `terra.yaml` descriptors (inert off-platform) and the bundle.

**Use Juno's build-from-repo runtime plugins.** They clone a repo and run one build command, which fits single-package repos, not a pnpm monorepo with a build order. Rejected; the workloads deploy as CI-built images as our own workload templates.

## Open items

1. **The full write pipeline against managed.** Seed, ES256 boot/auth, and managed DB reads are proven; the capture-to-audit smoke with real Hermes against managed was not re-run as a final step (it rests on the local k3d proof with the managed-specific risks now retired). Closing: deploy the charts to a cluster under `APP_ENV=dev` and run `pnpm smoke`.
2. **The Terra plugin contract.** Whether Terra discovers plugins at an arbitrary path or requires a `plugins/` root, and how a `terra.yaml` field injects into a chart value, are onboarding unknowns ([deploy/terra/README.md](../../deploy/terra/README.md)). Neither blocks a deploy: the direct-`helm install` fallback is deterministic.
3. **The Hermes MCP-reconnect gap** (#59): durable reconnect after an api restart, beyond the cold-start init container.
4. **Juno-onboarding confirmations:** the production ESO store and who reads it, the `cert-manager` ClusterIssuer and DNS delegation for the pane, CronJob RBAC for the recycler, hostname stability for the webhook and pane URLs, and which Hermes build the pilot runs.
