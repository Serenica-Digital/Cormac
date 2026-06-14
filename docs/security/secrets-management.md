# Secrets Management

Status: drafted (partial)
Maps to: control-register rows 12, 13, 14, 28, 29
Last reviewed: 2026-06-14

## What is true now

- Environment and secrets are one governed contract: a single manifest ([@cormac/config](../../packages/config/src/manifest.ts)) declares every variable once, classified secret or non-secret, and every workload validates its slice at boot. None are hard-coded. `.env.example` and each chart's `env`/`secretEnv` are generated from the manifest by `pnpm gen:env`; the manifest is the only declaration site (ADR-037).
- Secrets are read from the environment and validated at boot ([config.ts](../../apps/api/src/config.ts)); on Kubernetes they are injected via `secretKeyRef` from one k8s Secret, never baked into an image or chart default ([plugins/](../../plugins/)).
- Secret values have one authority: Infisical (ADR-037). Host tooling runs under `infisical run`, so no real `.env` of values sits on disk; the cluster's `cormac-secrets` is synthesized by the External Secrets Operator ([deploy/eso/](../../deploy/eso/)); CI is Infisical-free (its hermetic test database uses local Supabase). Every read is logged in Infisical.
- The Supabase service-role key is held only by the control plane and is never shipped to the browser or given to the runtime ([app.ts](../../apps/api/src/app.ts)). The browser holds only the anon key, which is safe because RLS bounds its reach.
- In prod-like environments (`APP_ENV`) the control plane fails closed: it refuses the public dev JWT secret, requires the runtime/MCP credentials and an explicit CORS allowlist, and verifies tokens JWKS-only (the HS256 path is disabled, so the public dev secret cannot forge a token; ADR-020/037).
- `.env` is gitignored; only [.env.example](../../.env.example) (generated, no real values) is committed, and `pnpm check:env` regenerates it and the Helm charts in memory and fails the build if either drifts from the manifest.
- A sensitivity-aware log-masking helper exists (`redactSensitive`, [redact.ts](../../packages/contract/src/redact.ts)) so record data can be logged with sensitive values masked.
- Generation, injection, and rotation are documented in [../runbooks/secrets-and-env.md](../runbooks/secrets-and-env.md).

## CI guards

- `check:secrets`: no service-role key or secret pattern appears in committed source or the web bundle ([ci.yml](../../.github/workflows/ci.yml)).
- `check:env`: `.env.example` and every Helm chart's `env`/`secretEnv` match what the manifest generates, and no secret is a literal in a chart ConfigMap ([scripts/check-env.ts](../../scripts/check-env.ts), control-register row 12/29).

## Named gaps (tracked)

- **Masking is not yet applied at every log site.** The helper exists and is tested; wiring it into all log statements that could carry record data is outstanding. Status `partial` (#41).
- **BYOK key protection is pending the billing connector** (ADR-013): encrypted at rest, never logged, with a rotation path. Not built yet.
- **The production cluster deploy is pending.** The Infisical -> ESO -> `cormac-secrets` chain is proven live on a local k3d cluster (the walking-skeleton smoke passed 11/11 with every secret sourced from Infisical, ADR-038); what remains is the same chain on the production Juno cluster, gated on the onboarding session (#15). This is a deployment step, not an unproven mechanism.

## Rotation

- Rotate a value once in Infisical; host tooling (`infisical run`), CI, and the cluster (ESO refresh, 1h) pick it up (ADR-037, [deploy/eso/README.md](../../deploy/eso/README.md)).
- Supabase keys rotate via the Supabase project, then the new value is set in Infisical; the procedure is in [../runbooks/secrets-and-env.md](../runbooks/secrets-and-env.md).
- BYOK rotation is owned by the client once that mode exists; the platform must support re-keying without downtime.
