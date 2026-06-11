# Deployment setup: images, env inventory, remote database

> **Status:** canonical · **Last reviewed:** 2026-06-10

The operational companion to [juno-platform-pilot.md](juno-platform-pilot.md): every deployable image, every environment variable each workload needs, which of them are secrets, and the bootstrap sequence for a managed Supabase project. This is the input to the secrets conversation at the Juno onboarding session.

## Images

CI publishes one private image per workload to GHCR on every push to `dev` or `main` (`.github/workflows/ci.yml`, `publish-images` job), tagged `:<commit-sha>` and `:<branch>`:

| Image | Built from | Notes |
| --- | --- | --- |
| `ghcr.io/serenica-digital/api` | `docker/Dockerfile.node` (`SERVICE=api`) | Control plane |
| `ghcr.io/serenica-digital/worker` | `docker/Dockerfile.node` (`SERVICE=worker`) | Same base image as api; only the CMD differs |
| `ghcr.io/serenica-digital/web` | `docker/Dockerfile.web` | See the Vite caveat below |
| `ghcr.io/serenica-digital/hermes-runtime` | `docker/Dockerfile.hermes` | Pinned `nousresearch/hermes-agent:v2026.6.5` + the baked profile from `docker/hermes-runtime/`; verified to boot headless from env alone |

Juno pulls these with an `image_pull_secret` (a GitHub PAT with `read:packages`, or a fine-grained token scoped to the org packages).

No image contains a secret. The hermes-runtime image carries `${VAR}` placeholders in its baked config; Hermes interpolates them from the workload env at load.

## Environment inventory

Secret = belongs in a Kubernetes Secret (or whatever mechanism the pilot cluster settles on), never in a chart default or an image.

### api (control plane)

| Var | Secret | Example / source | Purpose |
| --- | --- | --- | --- |
| `API_PORT` | no | `8088` | Listen port |
| `CORS_ORIGINS` | no | the web workload's public URL | Comma-separated CORS allowlist; defaults to the local web origins, so it MUST be set on deploy |
| `SUPABASE_URL` | no | `https://<project>.supabase.co` | System of record |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase project settings | The one key that bypasses RLS; only the api ever holds it (ADR-003, ADR-005). Hosted projects issue new-format keys (`sb_secret_...`); verified working for all bootstrap paths including auth-admin |
| `SUPABASE_JWT_SECRET` | **yes** | Supabase project settings | HS256 fallback for local/legacy projects only; the hosted dev project signs ES256 against its JWKS (ADR-020, confirmed below), so this stays unset on Juno |
| `SUPABASE_AUTH_ISSUER` | no | `https://<project>.supabase.co/auth/v1` | Expected `iss` claim when it differs from the fetch URL (needed locally in Docker; usually unset for a managed project) |
| `RUNTIME_KIND` | no | `hermes` | Runtime dispatch (`stub` exists for tests only) |
| `RUNTIME_URL` | no | `http://hermes-runtime:8642` (cluster DNS) | The Hermes Runs API |
| `RUNTIME_API_KEY` | **yes** | `openssl rand -hex 24` | Bearer key for the Runs API; same value as the runtime's `API_SERVER_KEY` |
| `RUNTIME_TIMEOUT_MS` | no | `90000` | Capture's wait for a terminal run |
| `MCP_WORKSPACE_ID` | no | seeded workspace UUID | The workspace the runtime's tool token is bound to |
| `MCP_WORKSPACE_TOKEN` | **yes** | `openssl rand -hex 24` | The runtime's tool-surface bearer token; the tenant binding (ADR-025/ADR-026) |

### worker

| Var | Secret | Example | Purpose |
| --- | --- | --- | --- |
| `WORKER_PORT` | no | `8070` | Health endpoint port |

(Supabase env lands here when the report and connector jobs do.)

### web

| Var | Secret | Example | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | no | the api workload's public URL | Control-plane endpoint |
| `VITE_SUPABASE_URL` | no | `https://<project>.supabase.co` | Auth |
| `VITE_SUPABASE_ANON_KEY` | no | Supabase project settings | Safe in the browser; RLS enforces reach. Hosted projects issue the new-format publishable key (`sb_publishable_...`), which fills this slot |

**Vite caveat (open item):** `VITE_*` values are baked at build time, not read at start. The current `Dockerfile.web` runs the dev server, which reads env at start and is fine for the pilot; a production web image needs either build-args at publish or runtime injection. Decide when the pilot needs a hardened web build.

### hermes-runtime

| Var | Secret | Example / source | Purpose |
| --- | --- | --- | --- |
| `API_SERVER_ENABLED` | no | `true` | Headless Runs API on |
| `API_SERVER_HOST` | no | `0.0.0.0` | Bind beyond localhost |
| `API_SERVER_PORT` | no | `8642` | Runs API port |
| `API_SERVER_KEY` | **yes** | same value as api's `RUNTIME_API_KEY` | Runs API bearer auth |
| `ANTHROPIC_API_KEY` | **yes** | Anthropic console | Model provider (ADR-013) |
| `MCP_SERVER_URL` | no | `http://api:8088/mcp` (cluster DNS) | Interpolated into the baked config |
| `MCP_WORKSPACE_TOKEN` | **yes** | same value as api's | Interpolated into the baked config; the workspace binding |
| `HERMES_ACCEPT_HOOKS` | no | `1` | Accept the profile's own `pre_tool_call` deny hook headlessly |

Deliberately absent: any Supabase variable (the runtime holds no database credentials, ADR-005/ADR-006) and any messaging platform token (gateways stay off, ADR-007).

## Managed Supabase bootstrap (the dev project)

One-time, against a fresh managed project (synthetic data only; creating the project is a dashboard action). The remote values live in local `.env` under the `REMOTE_` prefix (see `.env.example`) so they never collide with the local stack:

```sh
# 1. Schema, RLS, audit triggers (all migrations):
SUPABASE_DB_URL='postgresql://postgres:...@db.<project>.supabase.co:5432/postgres' pnpm db:push:remote

# 2. Demo workspace, owner login, example contract, seed record:
SUPABASE_URL='https://<project>.supabase.co' SUPABASE_SERVICE_ROLE_KEY='...' pnpm seed

# 3. Prove tenant isolation holds on the managed project:
SUPABASE_URL='https://<project>.supabase.co' SUPABASE_SERVICE_ROLE_KEY='...' SUPABASE_ANON_KEY='...' pnpm check:remote
```

**Executed 2026-06-10** against the dev project (`serenica-crm-agent`, Serenica Digital org, East US, free tier): all four migrations applied, the demo workspace seeded, and the cross-tenant isolation test passed 5/5 against the hosted database. Project creation notes: Data API on, "automatically expose new tables" left on for parity with the local CLI stack (tightening it is a production-hardening question, not a dev-project one), automatic RLS on as a harmless backstop to our own per-table policies. The free tier pauses the project after a week of inactivity; unpause from the dashboard.

**Resolved (ADR-020):** the hosted project signs user tokens **ES256** against its published JWKS (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`; the token `kid` matches the JWKS key), the issuer is exactly `${SUPABASE_URL}/auth/v1`, and `aud` is `authenticated`. So on Juno: `SUPABASE_AUTH_ISSUER` stays unset and `SUPABASE_JWT_SECRET` is not provisioned at all; JWKS verification is the only path the api needs.

## Pre-session secrets checklist (bring to the Juno onboarding)

Generate or collect before the session; each lands in the pilot cluster's secret mechanism, never in a chart default or the repo:

- [ ] `RUNTIME_API_KEY` = `API_SERVER_KEY`: one value, `openssl rand -hex 24` (generate fresh for the deployment; do not reuse the local one)
- [ ] `MCP_WORKSPACE_TOKEN`: `openssl rand -hex 24`, same freshness rule
- [ ] `ANTHROPIC_API_KEY`: from the Anthropic console
- [ ] `SUPABASE_SERVICE_ROLE_KEY`: the dev project's `sb_secret_...` key
- [ ] `VITE_SUPABASE_ANON_KEY` / `SUPABASE_URL`: the dev project's publishable key and URL (not secrets, but bring them)
- [ ] GHCR `image_pull_secret`: a GitHub PAT with `read:packages` for the `Serenica-Digital` org images. Note: a default `gh` CLI token does not carry this scope; mint a fine-grained PAT deliberately.

## Local reference

The same containers run locally with `pnpm db:start && pnpm seed && pnpm dev`; root `.env` (from `.env.example`) carries every value above. `docker/compose.yaml` is the local-only orchestration; it never ships.
