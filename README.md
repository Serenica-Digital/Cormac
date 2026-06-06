# Serenica CRM Agent

A multi-tenant, contract-first CRM agent platform. Clients bring the spreadsheets their business runs on; the system lifts each workbook into a governed, versioned semantic contract and operates on it through an agent reachable over web, SMS, email, Excel, and Claude/MCP.

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
  runtime-stub   stands in for the Dockerized Python Hermes runtime locally
supabase/
  migrations     app-owned schema, RLS, append-only audit
docker/    Dockerfiles + local compose
```

## Quick start (local)

Requires Node 22+, pnpm 10+, and Docker.

```sh
pnpm install
cp .env.example .env          # then paste keys printed by db:start
pnpm db:start                 # local Supabase (Docker); prints anon/service keys
pnpm dev                      # brings up api, runtime-stub, web via compose
```

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test` includes the cross-tenant RLS isolation test, which proves one workspace cannot read or write another's rows.
