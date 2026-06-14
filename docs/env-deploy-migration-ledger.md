# Migration ledger: old shape to new shape (env, secrets, deployment)

> **Status:** canonical · **Last reviewed:** 2026-06-13

This project changed shape. The old shape was Docker Compose for local orchestration, a hand-filled root `.env`, and environment variables declared in four places that drifted. The new shape is one env manifest that generates everything downstream, Infisical as the single secret authority synced into Kubernetes by the External Secrets Operator, and the Helm charts run on a local k3d cluster as both the dev environment and the deploy artifact. The decision is [ADR-035](adr/035-generated-env-infisical-k3d.md) (which supersedes the "check, don't generate" posture of [ADR-034](adr/034-environment-and-secrets-management.md)).

The new foundation is in and proven. This ledger is the running inventory of what has moved and what old cruft remains, so a fresh session does not have to reconstruct it from the diff. The GitHub board (Project #3) stays the prioritized work tracker; this is the shape companion to ADR-035. Every session that advances the migration flips a row here and names the commit.

## Ledger

| Area | Old shape | New shape | Status |
| --- | --- | --- | --- |
| Env declaration | four hand-edited sites (api schema, `.env.example`, compose, charts) | the manifest (`@cormac/config`) is the only declaration site; `pnpm gen:env` generates `.env.example` and each chart's `env`/`secretEnv`; `pnpm check:env` is a regenerate-and-diff guard | done (`ed5f5eb`) |
| Secret values | scattered: `.env`, the `REMOTE_*` block, GitHub Actions secrets, `kubectl create secret` | Infisical is the authority; ESO synthesizes `cormac-secrets`; pods read it via `secretKeyRef`. Proven live (smoke 11/11 with every secret from Infisical) | done (`a328bf5`) |
| Local secret injection | root `.env` sourced by every consumer | `infisical run` injects host tooling and the Vite frontends; no code reads `.env` | done (`62065be`); api `dotenv` line removed (this change) |
| Orchestration | `docker/compose.yaml` (local) plus the charts (deploy): two definitions | the Helm charts are the only orchestrator; backend runs in k3d, frontends on the host via Vite | done (this change): compose retired |
| `pnpm dev` | `docker compose ... --env-file .env up` | `bash scripts/k3d/up.sh` (backend in k3d) | done (this change) |
| CI/CD | flaky `supabase status -o env`; no chart gate; Infisical never exercised | Supabase env via JSON; `helm lint`/`template` gate on all charts; a guarded Infisical-completeness check | done (this change) |
| Juno dev workspace | undefined | code-server provisioned with Node 22 + pnpm + the Infisical CLI + a machine-identity token, so `infisical run` works non-interactively | documented (this change); provisioning runs at Juno onboarding |
| Prod posture (managed Supabase + ES256/JWKS) | chosen at the planning fork; every proof actually ran against local Supabase + HS256 | a live k3d proof against managed dev Supabase under `APP_ENV=dev` | **gated / unproven**: needs the managed dev service-role key in Infisical and a cluster run (ADR-035 open item 1). The `REMOTE_*` dual namespace is retained as the managed bootstrap set until then |
| PR / branch state | three commits unpushed, PR #58 showing only the first | branch pushed, PR #58 carries the full body of work | done (step 0) |

## Known remaining cruft (small, tracked here so it is not lost)

- The integration tests still `import 'dotenv/config'` (a no-op without a `.env`). They get env from CI's exported Supabase variables; locally run them under `infisical run -- pnpm test`. Dropping the import everywhere rides the CI Infisical-identity migration, not this change.
- `apps/api` / `apps/worker` bare-host `dev` scripts are wrapped in `infisical run`, but that path is non-standard (both run in k3d). The container path uses the image CMD and is unaffected.
- Historical ADRs (018, 026, 034) still describe compose as it was true when written. Per the house rule, settled decisions are not edited out; ADR-035 is the current truth.
