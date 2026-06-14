# ADR-037: Environment and secrets are one generated contract, with Infisical the single authority

**Status:** Accepted. Proven live: the walking-skeleton smoke passes 11/11 with every secret sourced from Infisical via ESO, host tooling runs entirely off `infisical run` (no `.env` on disk), and the managed `APP_ENV=dev` / ES256 posture boots and verifies a managed-issued token against the JWKS. This is the consolidated end-state of the environment-and-secrets half of the migration.
**Date:** 2026-06-13
**Related:** Consolidates and supersedes the environment-and-secrets portions of ADR-034 (one manifest, boot validation, fail-closed prod), ADR-035 (generation, Infisical-as-authority), and ADR-036 (one variable set, the guard deletions). Those three remain as the granular history of how each piece was decided; this ADR is what a reader dereferences for "how config and secrets work now." Companion to ADR-038, which consolidates the deployment half. Enforces ADR-003/ADR-005 (the service-role key is server-only; the runtime holds no database credentials) and ADR-020 (JWKS-only in production). Feeds ADR-015 (control-register rows 12 and 29).

## Context

Environment and secrets handling grew ad hoc, and a Kubernetes pilot deployment was near. The fix took four sessions and three intermediate ADRs (034, 035, 036), each correcting the last under direct review pressure. This ADR records where it landed and why, as one decision, so the end-state is not spread across a chain of supersessions.

The arc, because the reasoning is the journey:

1. **The disease: four declaration sites that drift.** A variable's existence, type, secret-or-not status, and per-workload wiring were declared independently in four places: the Zod schema in `apps/api/src/config.ts` (api only), `.env.example`, per-service blocks in `docker/compose.yaml`, and the (then non-existent) Helm charts. Only the api validated anything at boot. Two concrete failures made the drift visible: a variable the api read (`SSE_PROBE_ENABLED`) was documented and parsed but never passed through in compose, so an M1 route was dead in Docker; and the api kept a live HS256 token path whose secret defaulted to a string published in this repo, so a production deploy left at the default would let anyone who reads the repo forge an `aud=authenticated` token. ADR-034 introduced the manifest to fix this.

2. **The first correction: a guard is not consolidation.** ADR-034 added the manifest plus a checker (`check:env`) proving the four sites agreed. Review named the flaw precisely: that was a fifth artifact and a guard, not consolidation. To add a variable a developer still hand-edited the manifest, `.env.example`, a compose block, and chart values, with CI only reporting a mismatch after the fact. ADR-035 closed it by making the manifest *generate* the downstream files.

3. **The second correction: the contract governed variables, not values.** The manifest said which variables exist and how they validate, but never where the secret *values* lived or how they traveled. Values still scattered across a hand-filled `.env`, GitHub Actions secrets, and `kubectl create secret`, with no single authority, no rotation anyone had run, no access control, no read audit. The stated ask was streamlined, professional-grade secret management. ADR-035 chose Infisical as the single authority.

4. **The third correction: stop straddling two backends.** Modeling a local-plus-managed Supabase straddle in one environment had spawned a second `REMOTE_*` variable namespace, a `posture` notion the manifest carried, and an `isGatedManaged` hack in a completeness guard. Review found the root cause: the straddle itself. ADR-036 collapsed it (the deployment side is in ADR-038); the environment side is the single variable set recorded here.

## Decision

### 1. One manifest is the single declaration site

A single declarative manifest in `@cormac/config` ([packages/config/src/manifest.ts](../../packages/config/src/manifest.ts)) declares each variable once: its validation rule (`Z`, a Zod schema) and its metadata (`ENV`) — scope (`server` | `browser` | `runtime`), `secret`, which workloads read it, whether an operator sets it, and its production fail-closed rule. Nothing about a variable is born anywhere else. The api config, the worker, the scripts, and the browser apps all build their schemas from the manifest.

### 2. Generation, not checking

`pnpm gen:env` ([scripts/gen-env.ts](../../scripts/gen-env.ts), library in [scripts/lib/env-artifacts.ts](../../scripts/lib/env-artifacts.ts)) generates `.env.example` and each chart's `env`/`secretEnv` from the manifest. The manifest is the literal source; the other files are build output.

- `.env.example` is generated in full and round-trips (every value is a manifest default or an intentionally blank operator slot). Rendering policy lives in the generator, because that is presentation, not declaration.
- Each chart's `env`/`secretEnv` is reconciled surgically: the generator owns only which keys appear and their env-versus-secret classification in `values.yaml`, never environment values and never `image`/`ingress`/`resources`/`recycle`/`viteBuildArgs`. An in-sync chart returns byte-for-byte unchanged; a genuinely new key is appended with a loud `SET ME` placeholder.
- `check:env` is a regenerate-and-diff guard (the lockfile pattern): it regenerates in memory and fails the build, naming the file and the remediation (`pnpm gen:env`), if the tree disagrees. It keeps the secret-never-a-literal assertion.

Environment-specific values stay out of the manifest entirely: non-secret values live in chart `values.yaml` and the local overlays, secret values live in the authority below. The manifest never holds a hostname or a credential.

### 3. Every workload validates at boot, and production fails closed

`loadServerEnv(workload)` (Node) and `loadBrowserEnv(import.meta.env)` (web/pane) validate against the manifest at startup and fail loud on a missing or malformed value. An empty-string value is treated as unset. Under `APP_ENV` of `dev` or `prod`, `enforceProdRules` refuses to boot if `SUPABASE_JWT_SECRET` is the public dev value, if the runtime/MCP credentials are missing, or if `CORS_ORIGINS` is left at the localhost default. Token verification is JWKS-only in production (`hsSecret` is `null`), which closes the forgeable-token hole (ADR-020). `local` keeps developer-friendly defaults.

The fail-closed loader is the load-bearing mechanism: it is why a missing secret cannot start a process silently, and it is what made a separate secrets-completeness guard unnecessary (section 6). One consequence to record because it bit CI: the browser-env loader throws at import when `VITE_*` are absent, so the pane unit tests, which supply none, could not load. The fix is test `VITE_*` in `vitest.config.ts`, not a weakened validator.

### 4. Infisical is the single secret authority

One authority holds every secret value once; everything else references it and keeps no copy.

- **Host tooling** (seed, smoke, evals, the Vite frontends) runs under `infisical run -- <cmd>`. There is no live `.env` of real values on the laptop. `.infisical.json` (committed config, not a secret) binds the project and environment. Vite reads `VITE_*` from the injected process env, so the frontends need no `.env` either.
- **CI** holds at most one credential, an Infisical machine-identity token, and the CLI injects the rest. CI's hermetic test database mints its own values (ADR-038), which never enter Infisical.
- **The cluster** uses the External Secrets Operator: a namespaced Infisical `SecretStore` and one `ExternalSecret` synthesize the single `cormac-secrets` Secret the charts consume by `secretKeyRef` ([deploy/eso/](../../deploy/eso/)). `API_SERVER_KEY` and `RUNTIME_API_KEY` map from the same Infisical reference, so they match by construction.

Rotation happens once in the authority and local, CI, and the cluster pick it up; every read is logged, which is a real line in the security packet. Infisical is open-source, so self-hosting is the escape hatch and Juno stays swappable (ADR-017).

### 5. One variable set; the Infisical environment is the posture

There is one `SUPABASE_*` (and one of every other) variable set. Its *values* differ per Infisical environment: `local` (CI's fixture) holds local values, `dev` holds the managed dev values, `prod` holds production. The app reads `SUPABASE_URL`; `infisical run --env=<env>` decides what that is. This deleted the second `REMOTE_*` namespace, the `posture` notion in the manifest, and the `isGatedManaged` guard hack. There is no `.env` file in the system at all; only `.infisical.json` (a non-secret pointer) and `infisical login` once per machine.

### 6. Fewer guards, correct-by-construction

The principle the deletions encode: keep mechanisms that make drift impossible at the source, cut after-the-fact checkers that only report it. Kept: `gen:env` (the downstream files are generated, so they cannot diverge) and the fail-closed `loadServerEnv` (a missing secret cannot boot a process). Deleted: `check:infisical`, a completeness guard that only moved the missing-secret failure earlier than the loader already does, that needed the `isGatedManaged` hack to live with the straddle, and whose removal also removed the only reason CI needed an Infisical credential. CI is Infisical-free.

## Consequences

- Adding or changing a variable is a manifest edit plus `pnpm gen:env` (and a value in Infisical if it is a secret). The four-site hand-edit is gone; CI fails if the regenerate is forgotten.
- No real secret value lives on disk, in git, or in a chart spec. The security packet can claim a managed store with per-environment access control, rotation, and read audit (control-register rows 12 and 29; [secrets-management.md](../security/secrets-management.md), [subprocessors.md](../security/subprocessors.md)).
- The forgeable-token hole is closed: production verifies ES256 against the JWKS only, and the public dev secret cannot start a `dev`/`prod` process.
- Infisical is one more subprocessor next to Supabase, Anthropic, Twilio, and Juno. The open-source escape hatch keeps it from being lock-in.

## Alternatives considered

**Check, do not generate (the ADR-034 posture).** Rejected: it leaves the four-file hand-edit in place and only reports drift after the fact. Generation makes the manifest the literal source.

**Encode chart values in the manifest.** Rejected: the guard would rewrite an operator's real `CORS_ORIGINS`/`SUPABASE_URL` back to a placeholder on every run, and it drags environment-specific hostnames into a checked-in TypeScript file. The chart `values.yaml` and the secret authority are the correct homes for values.

**HashiCorp Vault as the authority.** Rejected as too heavy for a two-person team: a Vault cluster plus unseal and policy management is operational surface the product does not need at pilot scale, with a real lock-yourself-out failure mode.

**SOPS (encrypted secrets in git, decrypted at deploy).** The runner-up, and the only option where no third party holds the secrets even encrypted. Kept on the bench: chosen only if that becomes a hard requirement. Infisical wins now for the live `infisical run` developer loop, the per-environment access control and audit the security packet wants, and the first-class ESO provider.

**Self-host Infisical now.** Rejected for the pilot: it adds its own stateful Postgres and Redis, a stateful service the architecture deliberately avoids. Managed Infisical with self-host kept as the escape hatch is the lower-operational-cost choice; the charts consume a plain k8s Secret either way, so the backend can move without rewiring.

**Model the straddle (`posture`, `REMOTE_*`, a completeness guard).** Rejected: that was the disease. The clean mechanism (one variable set, values per Infisical environment) already existed; the straddle was working around it.

## Open items

1. **Runtime log-site masking** (`redactSensitive` applied at every log site) remains open (#41), tracked against control-register row 13. It is the one part of "secrets never leak" not yet enforced everywhere.
2. **CI Infisical posture.** CI is currently Infisical-free by design (it mints its own test database values). If a future CI job needs a real secret (for an end-to-end deploy test), it gets a read-only machine identity then, not before.
