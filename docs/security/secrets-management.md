# Secrets Management

Status: drafted (partial)
Maps to: control-register rows 12, 13, 14, 28, 29
Last reviewed: 2026-06-13

## What is true now

- Environment and secrets are one governed contract: a single manifest ([@cormac/config](../../packages/config/src/manifest.ts)) declares every variable once, classified secret or non-secret, and every workload validates its slice at boot (ADR-034). None are hard-coded.
- Secrets are read from the environment and validated at boot ([config.ts](../../apps/api/src/config.ts)); on Kubernetes they are injected via `secretKeyRef` from one k8s Secret, never baked into an image or chart default ([deploy/helm/](../../deploy/helm/)).
- The Supabase service-role key is held only by the control plane and is never shipped to the browser or given to the runtime ([app.ts](../../apps/api/src/app.ts), [compose](../../docker/compose.yaml)). The browser holds only the anon key, which is safe because RLS bounds its reach.
- In prod-like environments (`APP_ENV`) the control plane fails closed: it refuses the public dev JWT secret, requires the runtime/MCP credentials and an explicit CORS allowlist, and verifies tokens JWKS-only (the HS256 path is disabled, so the public dev secret cannot forge a token; ADR-020/034).
- `.env` is gitignored; only [.env.example](../../.env.example) (no real values) is committed, and `pnpm check:env` keeps it, compose, and the Helm charts in lockstep with the manifest.
- A sensitivity-aware log-masking helper exists (`redactSensitive`, [redact.ts](../../packages/contract/src/redact.ts)) so record data can be logged with sensitive values masked.
- Generation, injection, and rotation are documented in [../runbooks/secrets-and-env.md](../runbooks/secrets-and-env.md).

## CI guards

- `check:secrets`: no service-role key or secret pattern appears in committed source or the web bundle ([ci.yml](../../.github/workflows/ci.yml)).
- `check:env`: the manifest, `.env.example`, every compose `environment:` block, and every Helm chart agree; secrets are never a literal value in any of them ([scripts/check-env.ts](../../scripts/check-env.ts), control-register row 12/29).

## Named gaps (tracked)

- **Masking is not yet applied at every log site.** The helper exists and is tested; wiring it into all log statements that could carry record data is outstanding. Status `partial`.
- **BYOK key protection is pending the billing connector** (ADR-013): encrypted at rest, never logged, with a rotation path. Not built yet.
- **No managed secret store wired yet.** The Helm charts consume a plain k8s Secret via `secretKeyRef`; on Juno an External Secrets Operator can synthesize it from Vault / AWS Secrets Manager / Azure Key Vault with no chart change (template provided, [deploy/helm/secrets.example.yaml](../../deploy/helm/secrets.example.yaml)). Which backend the pilot uses is an onboarding confirmation (ADR-034). A rotation runbook now exists ([../runbooks/secrets-and-env.md](../runbooks/secrets-and-env.md)).

## Rotation

- Supabase keys rotate via the Supabase project; the procedure is in [../runbooks/secrets-and-env.md](../runbooks/secrets-and-env.md).
- BYOK rotation is owned by the client once that mode exists; the platform must support re-keying without downtime.
