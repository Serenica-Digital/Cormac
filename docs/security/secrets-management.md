# Secrets Management

Status: drafted (partial)
Maps to: control-register rows 12, 13, 14
Last reviewed: 2026-06-06

## What is true now

- Secrets are read from the environment and validated at boot ([config.ts](../../apps/api/src/config.ts)); none are hard-coded.
- The Supabase service-role key is held only by the control plane and is never shipped to the browser or given to the runtime ([app.ts](../../apps/api/src/app.ts), [compose](../../docker/compose.yaml)). The browser holds only the anon key, which is safe because RLS bounds its reach.
- `.env` is gitignored; only [.env.example](../../.env.example) (no real values) is committed.
- A sensitivity-aware log-masking helper exists (`redactSensitive`, [redact.ts](../../packages/contract/src/redact.ts)) so record data can be logged with sensitive values masked.

## CI guards

- A check that no service-role key or secret pattern appears in committed source or the web bundle ([ci.yml](../../.github/workflows/ci.yml)).

## Named gaps (tracked)

- **Masking is not yet applied at every log site.** The helper exists and is tested; wiring it into all log statements that could carry record data is outstanding. Status `partial`.
- **BYOK key protection is pending the billing connector** (ADR-013): encrypted at rest, never logged, with a rotation path. Not built yet.
- **No managed secret store yet.** The pilot uses environment/secret injection from the deployment platform; a dedicated secret manager and rotation policy are a hardening item.

## Rotation

- Supabase keys rotate via the Supabase project; document the runbook before a pilot.
- BYOK rotation is owned by the client once that mode exists; the platform must support re-keying without downtime.
