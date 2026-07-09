# Runbook: key rotation

Internal. Every credential in the system, how to rotate it, and what breaks
if you forget.

## Inventory

| Credential | Where | Rotate by | Expiry behavior |
| --- | --- | --- | --- |
| Supabase service-role key | Infisical (`SUPABASE_SERVICE_ROLE_KEY`) | Supabase dashboard → new key → update Infisical → restart control plane | No expiry; rotate on exposure or personnel change |
| Supabase anon key | Infisical | Same path | Public by design; rotate with the service key |
| Agent tokens (`CORMAC_AGENT_TOKEN`, `CORMAC_OPS_AGENT_TOKEN`) | Infisical + gateway env | Revoke old (operator console), clear the Infisical slot, rerun the seed (`pnpm seed:authoring-e2e` / `seed:ops-e2e` / `seed:demo`) which mints + binds; relaunch the gateway | No expiry; hash-only at rest |
| Entra (Microsoft) client secret | Infisical (`SUPABASE_AUTH_EXTERNAL_AZURE_SECRET`) + Supabase dashboard | Entra portal → new secret → both places | **Expires (max 24 months).** Microsoft sign-in dies silently at expiry. Record the date here when created: ____ |
| Google OAuth client secret | Infisical (`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`) + dashboard | Google console → rotate → both places | No forced expiry |
| SUPABASE_JWT_SECRET (dev only) | Infisical dev | Local stack value; never used prod-like (HS256 refused there) | Dev-only by construction |
| Juno Genesis token | Dev substrate | Juno platform procedure | Dev substrate only, no client data; rotation status was flagged in requirements — treat as an open item and record the outcome here |
| Infisical machine identities | Infisical org settings | Infisical UI | Governs everything above; rotate on personnel change |
| GitHub deploy/PAT tokens | GitHub settings | Standard GitHub rotation | — |

## The one rule

Raw agent tokens are never stored server-side (hash only) and never logged.
A rotation that would print a raw token anywhere but the minting terminal is
wrong; the seed scripts already handle mint-into-Infisical directly.

## After any rotation

Run the smoke (`node tools/e2e/smoke.mjs`) and one agent turn per lane to
prove the system still authenticates end to end.
