# Secrets management

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

## One authority (row 22 — Partial)

Every secret lives in Infisical. Processes receive them by running under
`infisical run`; configuration is read from process env only. There is no
`.env` file anywhere in the repo, and the control plane's config loader has
no dotenv path at all. Named gap: v2 has no automated secret scan or env
lint yet (v0 had both; porting them is on the roadmap).

## Key posture

| Secret | Holder | Notes |
| --- | --- | --- |
| Supabase service-role key | Control plane only | The only write-capable database credential |
| Agent tokens (raw) | Infisical + the running gateway env | Only the SHA-256 hash is stored server-side (row 6 — Verified); rebinding a token to a new workspace never changes the raw value, so rotation and reseeding do not require redistributing secrets |
| OAuth provider secrets (Entra, Google) | Infisical, `env()`-substituted into Supabase config | Entra client secrets expire; expiry is tracked in the key-rotation runbook |
| JWT verification | No shared secret in prod-like envs | ES256 via the published JWKS; the HS256 dev secret is refused outside dev (row 8) |

Rotation procedures: [docs/runbooks/key-rotation.md](../runbooks/key-rotation.md).

## Demo and test credentials (row 23 — Partial)

Fixed demo personas (`*@demo.test`, one shared password) exist for local
development. Two guards keep them local: the seed CLI refuses any
non-development environment or non-local database host, and demo agent-token
binding is refused outside the demo namespace (the latter is tested; the
host guard itself is not — named gap). E2E seeds generate random
per-run credentials that are never stored.
