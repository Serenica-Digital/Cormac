# ADR-035: One source of truth by generation; Infisical the secret authority; Helm the only orchestrator; k3d the local environment

**Status:** Accepted. The generation model, Infisical-as-authority, and the k3d deployment are proven live: the walking-skeleton smoke passes 11/11 against local Supabase with every secret sourced from Infisical via ESO (commits `a328bf5`, `62065be`), and local dev runs entirely off `.env`. Compose is retired and `pnpm dev` runs the charts on k3d. What remains gated is the managed dev Supabase + ES256 posture (Open item 1). Resolves ADR-034 Open item 2 (the secret backend). **Superseded and consolidated by ADR-037 (generation, the Infisical authority) and ADR-038 (Helm-only, k3d, local-to-prod parity); kept as the granular record of how generation and the secret authority were decided. Open item 1 is closed by ADR-038 (the managed/ES256 posture is now proven live).**
**Date:** 2026-06-13
**Related:** Supersedes the "check, don't generate" posture of ADR-034 (sections 2-3) and resolves its open secret-backend question. Keeps ADR-034's manifest, boot validation, and fail-closed prod rules intact. Enforces ADR-003/ADR-005 (the service role key is server-only; the runtime holds no database credentials) and ADR-020 (JWKS-only in prod). Realizes the deployment direction of ADR-017 (Juno preferred, kept swappable) by making the local environment run the same charts. Touches the M1 pane surface (ADR-028/031): the pane's backend moves from compose to k3d.

## Context

ADR-034 made the env manifest (`@cormac/config`) the single declaration site and added a checker (`check:env`) that proved `.env.example`, `docker/compose.yaml`, and the Helm charts agreed with it. That closed the drift hole, but it was a fifth artifact plus a guard, not consolidation: adding a variable still meant hand-editing the manifest, `.env.example`, a compose block, and chart values, with CI only catching a mismatch after the fact. Two problems remained, and they are the ones this ADR closes.

First, the manifest declared variables but did not generate the files beside it, so "one source of truth" oversold the day-to-day reality. Second, the manifest governed which variables exist and how they validate, but never where secret values live or how they travel: values still scattered across a hand-filled `.env`, GitHub Actions secrets, and `kubectl create secret`. There was no single authority, no rotation anyone had run, no access control, and no read audit. The Helm charts existed but had never run on a cluster, so the deployment was asserted, not demonstrated, against the project's own bar (a live system, not green checkmarks).

ADR-034 deliberately left the secret backend open ("plain Secrets vs. an External Secrets Operator syncing from Vault / AWS Secrets Manager / Azure Key Vault") and deliberately kept compose as the local rehearsal. Both are now decided.

## Decision

### 1. Consolidation by generation

`pnpm gen:env` ([scripts/gen-env.ts](../../scripts/gen-env.ts), library in [scripts/lib/env-artifacts.ts](../../scripts/lib/env-artifacts.ts)) generates the artifacts from the manifest. The manifest stays the only place a variable is declared.

- **`.env.example` is generated in full.** Every value it carries is a manifest default (the Zod schema) or an intentionally blank operator slot, so it round-trips. Rendering policy (section grouping, emit mode, operator hints) lives in the generator, because that is presentation, not declaration; a variable with no section override still renders, so adding one to the manifest is never silently dropped.
- **Each chart's `env`/`secretEnv` is reconciled surgically.** The generator owns only which keys appear and their env-versus-secret classification, in the chart's `values.yaml`. It never writes environment values and never touches `image`/`ingress`/`resources`/`recycle`/`viteBuildArgs`. A chart already matching the manifest is returned byte-for-byte unchanged, so an in-sync chart never churns through the serializer. A genuinely new key is appended with a loud `SET ME` placeholder for the operator to fill.
- **`check:env` is a regenerate-and-diff guard** (the lockfile pattern): it regenerates in memory and fails the build, naming the file and the remediation (`run pnpm gen:env`), if the tree disagrees. It keeps the secret-never-a-literal assertion and drops every compose check, because compose is retired.

Environment-specific values stay where they belong: non-secret values in the chart `values.yaml` (and the local overlays), secret values in the authority below. The manifest is never asked to hold a hostname or a credential.

### 2. Infisical is the single secret authority

One authority holds every secret value once; everything else references it and keeps no copy.

- **Host tooling** (seed, evals) runs under `infisical run -- <cmd>`, so secrets leave the developer's disk: there is no live `.env` of real values on the laptop. `.infisical.json` (committed config, not a secret) binds the project and environment.
- **CI** holds exactly one credential, an Infisical machine-identity token; the Infisical CLI injects the rest at run time.
- **The cluster** uses the External Secrets Operator. An Infisical `SecretStore` (authenticated by a bootstrap k8s secret created out of band) and an `ExternalSecret` synthesize the one `cormac-secrets` Secret the charts already consume by `secretKeyRef` ([deploy/eso/](../../deploy/eso/)). No deployment template changes; only the Secret's provenance does. `API_SERVER_KEY` and `RUNTIME_API_KEY` map from the same Infisical reference, so they match by construction.

Rotation happens once in the authority and local, CI, and the cluster pick it up; every read is logged, which becomes a real line in the security packet. Infisical is open-source, so self-hosting is the escape hatch and Juno stays swappable (ADR-017).

### 3. Helm is the only orchestrator; k3d is the local environment

`docker/compose.yaml` is retired. Local development runs the same Helm charts on a local k3d cluster ([deploy/k3d/](../../deploy/k3d/), `pnpm k3d:up`/`k3d:down`) that deploy to Juno, so the deployment is proven on the developer's Mac (arm64-native: images are built locally and imported, never pulled amd64 from GHCR) before it ships. The backend (api, worker, hermes-runtime) runs in-cluster; the web and pane frontends run on the host via Vite against the cluster's api, because their `VITE_*` are build-time and the pane needs host HTTPS for sideload. Per-chart `values.local.yaml` overlays carry the local posture (local images, no pull secret, ingress off, no recycle CronJob).

### 4. The local posture is managed dev Supabase

The local k3d stack talks to the managed dev Supabase project, so `APP_ENV=dev`: ES256/JWKS-only verification, `hsSecret` null, and the fail-closed prod rules actually fire (real `CORS_ORIGINS`, the runtime and MCP credentials required, the public dev JWT secret refused). The local run is a prod-like rehearsal rather than an offline toy. The api therefore needs the managed project URL and anon key (non-secret, in the overlay) and the secrets in `cormac-secrets` to boot; `worker` and `hermes-runtime` boot credential-free, which is the mechanics half of the proof.

## Consequences

- Adding a variable is a manifest edit followed by `pnpm gen:env`; CI fails if the regenerate is forgotten. The four-site hand-edit is gone.
- No real secret value lives on disk, in git, or in a chart spec. The security packet can claim a managed store with rotation and read audit (control-register rows 12 and 29; [secrets-management.md](../security/secrets-management.md), [subprocessors.md](../security/subprocessors.md)).
- The deployment artifact is exercised, not just rendered. The arm64 risk for the upstream Hermes image is cleared (it ships a `linux/arm64` build).
- The M1 pane backend moves to k3d. The pane sideload runbook gains a k3d path; compose is removed only after the live k3d proof passes, so there is never a broken window for in-flight M1 work.
- CI builds amd64 images for Juno; local k3d builds arm64 and imports. The two image lanes are deliberate and documented.

## Alternatives considered

**Keep checking, do not generate (the ADR-034 posture).** Rejected: it leaves the day-to-day four-file edit in place and only reports drift after it happens. Generation makes the manifest the literal source and the other files build output.

**Encode chart values in the manifest (so the generator emits real values).** Rejected: the guard would rewrite an operator's real `CORS_ORIGINS`/`SUPABASE_URL` back to a placeholder on every run, and it would drag environment-specific hostnames into a checked-in TypeScript file. The chart `values.yaml` and the secret authority are the correct homes for values; the generator owns only key membership and classification.

**HashiCorp Vault as the authority.** Rejected as too heavy for a two-person team: a Vault cluster plus unseal and policy management is more operational surface than the product needs at pilot scale.

**SOPS (encrypted secrets in git, decrypted at deploy).** The runner-up, and a clean no-third-party-holds-our-secrets answer that fits Terra's ArgoCD. Kept on the bench: chosen only if "no external party holds our secrets even encrypted" becomes a hard rule. Infisical wins now for the live `infisical run` developer loop and the first-class ESO provider.

**Self-host Infisical now.** Rejected for the pilot: it adds its own stateful Postgres and Redis to operate. Managed Infisical with self-host kept as the escape hatch is the lower-operational-cost choice; the charts consume a plain k8s Secret either way, so the backend can move without rewiring.

**Keep compose as the local environment.** Rejected: two orchestrators drift (the original disease), and compose never proves the charts. One orchestrator, run locally on k3d, is both the daily environment and the portability proof.

## Open items

1. **The managed dev Supabase + ES256 posture is unproven.** The live proof to date ran against *local* Supabase under `APP_ENV=local` (HS256). The prod-like path chosen at planning (managed dev Supabase, `APP_ENV=dev`, JWKS/ES256-only per ADR-020) has not been run. It needs the managed dev service-role key, URL, and JWKS issuer in Infisical's `dev` environment, which currently holds local-posture values. The managed bootstrap namespace (`REMOTE_*`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`) is retained for this and is excluded from the `check:infisical` completeness guard (`isGatedManaged`) until proven. Closing this: push the managed values to Infisical, run the k3d smoke under `APP_ENV=dev`, then drop the guard's exclusion.
2. **Compose retired (done).** `docker/compose.yaml` and its scripts are removed and the M1 pane runbook is migrated to k3d, after the local k3d walking-skeleton proof passed. `pnpm dev` runs the charts on k3d; the runtime's no-DB-credentials evidence moved from compose to the [hermes-runtime chart](../../deploy/helm/hermes-runtime/values.yaml).
3. **The production ESO store.** k3d uses a namespaced Infisical `SecretStore`; Juno uses a `ClusterSecretStore`. Which Infisical project/environment maps to prod, and who may read it, is a Juno-onboarding confirmation.
4. **CI machine-identity rollout (partly done).** CI now lints and renders the charts, exports Supabase env via JSON (not the flaky `-o env`), and runs a guarded `check:infisical` completeness step that activates once the `INFISICAL_TOKEN` repo secret is set. Remaining: create the read-only CI machine identity, set that secret, and migrate CI's test Supabase env from `supabase status` to Infisical-injected values.
5. **Juno dev-workspace provisioning.** The workspace contract (Node 22 + pnpm + the Infisical CLI + a machine-identity `INFISICAL_TOKEN`, so `infisical run` works non-interactively) is in [the dev-workspace runbook](../runbooks/juno-dev-workspace.md); provisioning runs at Juno onboarding.
