# Cormac

A multi-tenant, contract-first CRM agent platform, by Serenica Digital. Clients bring the spreadsheets their business runs on; the system lifts each workbook into a governed, versioned semantic contract and operates on it through an agent reachable over web, SMS, email, Excel, and Claude/MCP.

The design lives in [docs/](docs/). Read the ADRs first ([docs/adr/](docs/adr/)); everything else dereferences them. The build sequence is [docs/prd/build-plan.md](docs/prd/build-plan.md).

## The one invariant to remember

The **control plane** (`apps/api`) is the only thing that writes business records. Surfaces and the agent runtime never write directly, and the runtime holds no database write credentials. See [CLAUDE.md](CLAUDE.md) for the full set.

## Layout

```
apps/
  api      control plane (Node/TypeScript, Fastify) — the only writer
  web      minimal web surface (React/Vite) for the walking skeleton
  worker   background jobs (weekly report, connectors) — stub for now
packages/
  contract contract types + Zod meta-schema (what a published contract is)
  db       Supabase client factory + typed table helpers
  shared   shared types and roles
services/
  runtime-stub   deterministic test fixture for the runtime seam (tests only;
                 the running stack uses real Hermes in k3d via the Helm charts)
supabase/
  migrations     app-owned schema, RLS, append-only audit
deploy/    Helm charts (the orchestrator), k3d config, ESO/Infisical wiring
docker/    Dockerfiles + the Hermes runtime profile
```

## Quick start (local)

Requires Node 22+, pnpm 10+, Docker, the k3d/kubectl/helm and Infisical CLIs, and access to the managed dev Supabase project (ADR-036; see [docs/runbooks/secrets-and-env.md](docs/runbooks/secrets-and-env.md)).

```sh
pnpm install
infisical login               # one-time; all env/secret values come from Infisical, not a .env (ADR-036)
# one-time: install ESO + apply deploy/eso so the cluster reads cormac-secrets from Infisical
pnpm dev                      # backend in local k3d (Helm charts) against managed Supabase
infisical run -- pnpm seed    # demo workspace, owner login, contract, one record
```

The frontends run on the host against the cluster: `pnpm --filter @cormac/pane dev`. Local dev, k3d, and Juno all use the managed dev Supabase; the local Supabase stack (`pnpm db:start`) is only for CI and offline tests.

Day-to-day gotcha: `pnpm db:start` reuses the running local database and does
NOT apply migrations added since it started. `pnpm check:migrations` detects
this drift (CI always runs fresh, so undetected drift fails there first);
`pnpm db:reset` fixes it.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test                     # leaves the local db as it found it (afterAll purge)
pnpm check:migrations         # local db schema matches supabase/migrations
pnpm check:secrets            # no keys or tracked .env in the repo
```

`pnpm test` includes the cross-tenant RLS isolation test, which proves one workspace cannot read or write another's rows.
