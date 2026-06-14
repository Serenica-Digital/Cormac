# ADR-036: One Supabase backend (managed everywhere except CI); the Terra packaging for Juno

**Status:** Accepted. The managed `APP_ENV=dev` / ES256 posture is proven live (seed, fail-closed boot, JWKS verification of a managed-issued ES256 token, and a managed Postgres read against the managed dev project), which closes ADR-035 open item 1. CI is green on `f17aaa6`. The Juno cluster deploy itself stays gated on the onboarding session (#15).
**Date:** 2026-06-13
**Related:** Supersedes the local/managed *straddle* introduced by ADR-034/035 (the `REMOTE_*` namespace, the `posture`/`isGatedManaged` modeling, the dual `ExternalSecret`, the `ClusterSecretStore`); keeps everything else those ADRs decided intact (the `@cormac/config` manifest, generation by `gen:env`, fail-closed prod rules, Infisical as the secret authority, ESO, Helm-on-k3d). Enforces ADR-003/ADR-005 (managed Supabase is the system of record; the runtime holds no DB credentials) and ADR-020 (JWKS-only in prod). Realizes the deployment direction of ADR-017 (Juno preferred, kept swappable) by packaging the existing charts as Terra plugins plus a bundle.

## Context

ADR-034 and ADR-035 cleaned up env and secrets, but they left one structural mess in place: the system straddled **two Supabase backends** at once, a local CLI stack and the managed dev project, crammed into a single environment. Every awkward artifact that accreted afterward existed only to model that straddle: a second `REMOTE_SUPABASE_*` variable namespace, a `posture` notion the manifest had no business carrying, an `isGatedManaged` name-prefix hack in a completeness guard, a duplicate local `ExternalSecret`, and a `ClusterSecretStore` proposed so one store could span namespaces we do not have.

A second failure exposed the same root. CI had been red since the first env-secrets commit, not from a later change: the fail-closed browser-env validator (`packages/config/src/browser.ts`) throws at import, and the `apps/pane` unit tests supplied no `VITE_*`. The prior "all green" runs had executed `vitest run tests/unit`, which excludes `apps/pane/**`, so the gate was never the real one. Modeling the straddle and running a subset of the tests were the same mistake in two places: complexity standing in for a clean design.

## Decision

### 1. Managed Supabase is the single backend; local survives only for CI

Managed Supabase is the one backend for **human dev, local k3d, and Juno** (`APP_ENV=dev`, ES256/JWKS-only, the fail-closed prod rules live). **Local Supabase is demoted to CI's hermetic test fixture only** (`APP_ENV=local`, HS256, values minted by `supabase start` at run time, never in Infisical, never in the app's env model). The integration suites (tenant isolation, RLS, purge) are destructive and want a throwaway Postgres per run, which is the one place a local stack genuinely earns its keep.

### 2. The Infisical environment is the posture

There is one `SUPABASE_*` variable set. Its *values* differ per Infisical environment (`dev` holds the managed values; CI mints local values itself). The app reads `SUPABASE_URL`; `infisical run --env=dev` decides what that is. This deletes `posture` as a concept: the environment is the posture.

### 3. The deletions

`REMOTE_SUPABASE_*` (no code consumer), `posture`, `isGatedManaged`, the duplicate local `ExternalSecret`, and the `ClusterSecretStore` idea are gone. One namespaced ESO `SecretStore` plus one `ExternalSecret` synthesize `cormac-secrets`, **identical on k3d and Juno** (a `ClusterSecretStore` is only needed to span namespaces, and we deploy into one `cormac` namespace). `check:infisical` is deleted: the fail-closed loader already refuses to boot on a missing secret, so the guard only moved that failure earlier, it was the thing that needed `isGatedManaged`, and removing it also removed the only reason CI needed an Infisical credential. CI is now Infisical-free.

### 4. Fewer guards, correct-by-construction kept

The principle the deletions encode: keep mechanisms that make drift impossible at the source (`gen:env` generating the downstream files; `loadServerEnv` failing closed on a missing secret), cut after-the-fact checkers that only report drift (`check:infisical`). A guard is an admission the design can drift; the design should not drift.

### 5. The Juno deployment is the same charts, packaged as Terra

Because the collapse made local k3d and Juno run the same charts against the same managed backend, the Juno packaging is thin. A Terra plugin is a Helm chart plus a `terra.yaml`, so each `deploy/helm/<workload>/` chart carries its own `terra.yaml` and **is** a Terra plugin in place (no duplicate charts). A `cormac` bundle ([../../deploy/terra/bundles/cormac.yaml](../../deploy/terra/bundles/cormac.yaml)) groups the five workloads. The deploy runbook ([../runbooks/deploy-to-juno.md](../runbooks/deploy-to-juno.md)) carries two tracks: the Terra-native launch, and a guaranteed direct-`helm install` fallback that depends on nothing Juno-specific, so an onboarding-session deploy is never blocked on resolving Terra's plugin contract live.

## Consequences

- **CI is the real gate now and it is green.** The fix was `test.env` `VITE_*` in `vitest.config.ts`; the full `pnpm test` (143 tests, 24 files, integration + pane) runs and passes on `f17aaa6`.
- **k3d ≈ Juno.** The charts, in-cluster Service DNS, `secretKeyRef` consumption, and the ESO `SecretStore` are byte-identical between local k3d and Juno. The only deltas are local-built arm64 images vs GHCR amd64, and ingress off (local) vs on (Juno).
- **The managed posture is proven, not asserted.** `pnpm seed` wrote to the managed project; the api boots under `APP_ENV=dev`, verifies a managed-issued ES256 token via JWKS, and reads managed Postgres. This closes the long-gated ADR-035 open item 1 for the auth and data paths.
- **Operational note:** the managed dev project is Supabase free-tier and pauses after a week of inactivity; a paused project must be resumed before a deploy or smoke.
- **Security packet:** managed Supabase remains the single system of record (already a listed subprocessor); the secret authority and ESO story are unchanged from ADR-035.

## Alternatives considered

**Keep modeling the straddle (`posture`, `REMOTE_*`, dual stores).** Rejected. That was the disease, not a feature. The clean mechanism (one variable set, values per Infisical environment) already existed and the straddle was working around it.

**Managed everywhere including CI (Supabase branching).** Hermetic CI against managed needs branching, a Pro-plan feature (~$25/mo plus per-branch compute), PR-scoped and ephemeral. Supabase's own CI guidance uses free local `supabase start`. Rejected: keeping local for CI is free, is what CI already did, and does not reintroduce posture, because CI's database is an internal fixture whose values never enter Infisical or the app's env model.

**Run Postgres in-cluster (own the database).** Rejected. There is no Terra Supabase/Postgres plugin, and it adds a stateful service the architecture deliberately avoids; managed Supabase is the system of record (ADR-003).

**Wire the CI Infisical credential and keep `check:infisical`.** Rejected. Deleting the guard removed the need for the credential. The fail-closed loader enforces secret presence at boot, which is the same property the guard was reaching for, earlier and without a hack.

**Author wrapper charts under `deploy/terra/plugins/` for the Terra packaging.** Rejected as duplication. A Terra plugin is a chart plus a `terra.yaml`, so the chart becomes the plugin in place; the only Juno-specific files are five small `terra.yaml` descriptors (inert off-platform) and the bundle.

## Open items

1. **The full write pipeline against managed.** Seed, ES256 boot/auth, and managed DB reads are proven; the capture→propose→approve→audit smoke with real Hermes against managed was not re-run this session (it rests on the local k3d ADR-026 proof, with the managed-specific risks now retired). Closing: deploy the charts to a cluster under `APP_ENV=dev` and run `pnpm smoke`.
2. **The Terra plugin contract.** Whether Terra discovers plugins at an arbitrary path or requires a `plugins/` root, and how a `terra.yaml` field injects into a chart value, are onboarding unknowns ([../../deploy/terra/README.md](../../deploy/terra/README.md)). Neither blocks a deploy: the direct-`helm install` fallback is deterministic.
3. **The Hermes MCP-reconnect gap.** Hermes opens its control-plane connection once at boot and does not reconnect if the api restarts (ADR-035). The `wait-for-api` init container covers cold start; durable reconnect is a pilot follow-up and is not yet a filed issue.
