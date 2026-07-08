# 0006 — Environment model: one Supabase project per tier; Infisical env slugs carry the mapping

- **Status:** Accepted (2026-07-08)
- **Builds on:** ADR-0003 (deployment posture), ADR-0005 (Infisical is the secret authority)

## Context

Supabase isolates at the project level; there are no environments inside a project. During
#66 phase 7 the managed project's credentials landed in Infisical's `dev` environment (the
only one in use), which made the default `pnpm test` inject managed credentials into an
integration suite that creates and purges workspaces. The near-miss forced the question
the repo had never answered: which environments exist, which database backs each, and
which vault slot holds each set of values.

## Decision

One Supabase project per tier, never shared, with the Infisical environment slug as the
single switch:

| Tier | Backing database | Infisical env | APP_ENV |
|---|---|---|---|
| Local dev + tests | Supabase CLI stack (Docker, disposable, `db reset` at will) | `dev` | `development` |
| Managed dev/staging | Project `tcemqghhhfllvmmncshe` (restored v0 project, v2 schema) | `staging` | `staging` |
| Production (future) | A separate project, created at deployment time | `prod` | `production` |

Rules:

- `APP_ENV` lives in the vault env alongside the credentials it belongs to, so the control
  plane's prod-posture switch (HS256 refused, JWKS/ES256 only) flips with the environment
  and never by hand.
- The integration suite points only at `dev`. Scripts that touch the managed project
  (`check:remote`, `db:push:managed`) are pinned to `--env=staging` in `package.json`.
- `dev` holds the local stack's well-known public demo values; they are stored anyway so
  there is exactly one lookup path (`infisical run`), never a second convention.
- `prod` stays empty until the deployment issue provisions the production project; nothing
  may point at it before then.

## Consequences

- Standing up production is vault-fill plus a new project; no code changes
  (`apps/control-plane/src/config.ts` reads whatever is injected).
- The staging project doubles as the kind/EKS rehearsal target when deployment work
  starts (ADR-0003); its Hermes wiring arrives with that issue.
- Two stale managed-only entries (`SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`) remain in
  `dev` because CLI deletes currently error; remove via the dashboard. Key rotation on
  the staging project stays open hygiene (owner deferred).

## Alternatives considered

- **Supabase preview branches:** paid feature, and it addresses ephemeral review copies,
  not the dev/staging/prod separation itself.
- **One shared managed project for tests and staging:** rejected; the suite purges
  workspaces by design.
- **Env-suffixed secret names in a single vault environment** (`SUPABASE_URL_STAGING`):
  rejected; drift-prone and defeats `infisical run`'s inject-by-environment model.
