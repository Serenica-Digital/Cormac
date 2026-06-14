# Runbook: the Juno dev-workspace contract

> **Status:** draft · **Last reviewed:** 2026-06-13

Juno provisions the development environment, not the laptop (ADR-017): you launch a **code-server (`web-ide`) workspace** in the dev cluster and work there. This runbook is the contract for what that workspace must carry so the env/secrets shape (ADR-037/038) works in it, and how `infisical run` authenticates without an interactive browser login. It is also input for the Juno onboarding session.

The research is explicit that the stock workspace image is bare: the `web-ide` (code-server) plugin's image ships **no Node, no pnpm, and no Docker** ([../research/juno-hermes-deployment-research.md](../research/juno-hermes-deployment-research.md)). So the workspace is provisioned, not assumed.

## What the workspace must carry

| Need | Why | Note |
| --- | --- | --- |
| Node 22 + pnpm 10 | build and run the monorepo | from `.nvmrc`/`engines`; bake into the workspace image or install on first boot |
| git | clone and push the repo | code-server has a terminal; SSH or token auth |
| Infisical CLI | inject env via `infisical run` (ADR-037) | authenticated by a machine-identity token, see below |
| k3d + kubectl + helm | run the charts as the local stack | only if the stack runs inside the workspace; otherwise the workspace targets the cluster's `cormac` namespace directly |
| Docker | only to run the local integration test suite (`supabase start` is CI's hermetic Postgres) | **not needed for normal dev**: dev and the deployed stack use the managed dev Supabase (ADR-038). Docker-in-workspace (socket mount or DinD) is an onboarding question only if those destructive tests must run in the workspace |

## Non-interactive Infisical auth (the load-bearing piece)

`infisical login` opens a browser and does not fit a remote workspace. Use a **machine identity** instead, which the CLI reads from the `INFISICAL_TOKEN` environment variable (verified against the Infisical CLI docs):

1. In Infisical, create a machine identity (Universal Auth) with **read** on the `cormac` project's `dev` environment. This is the same pattern as the cluster's `cormac-eso` identity ([../../deploy/eso/](../../deploy/eso/)); use a separate identity for the workspace so it can be revoked independently.
2. Put its token in the workspace as `INFISICAL_TOKEN` (a workspace secret/env var, never committed).
3. `infisical run -- pnpm <script>` now injects secrets with no browser step. `pnpm seed`, `pnpm smoke`, and the app `dev` scripts already wrap `infisical run`, so they need no extra prefix.

## Two ways to get secrets in the workspace

- **A. `infisical run` (portable default).** Host tooling and the Vite frontends inject from Infisical via the machine identity above. This matches laptop dev exactly and is the recommended default.
- **B. Read the ESO-synced secret (in-cluster only).** The workspace runs inside the cluster where ESO already synthesizes `cormac-secrets` ([../../deploy/eso/externalsecret.yaml](../../deploy/eso/externalsecret.yaml)). Workspace tooling can read that one Secret via `envFrom`, collapsing to a single injection mechanism. Consider this once the dev cluster is real; it removes the workspace's own Infisical dependency for the running stack.

## Bootstrap (once per workspace)

```sh
# In the code-server terminal, in the cloned repo:
node -v && pnpm -v && infisical --version   # confirm the toolchain is present
export INFISICAL_TOKEN=<machine-identity-token>   # workspace secret, not committed
pnpm install
pnpm seed                                    # demo workspace + owner on managed Supabase (self-wraps infisical run)
pnpm dev                                     # the charts in the cluster's namespace
```

## Open onboarding questions (carry to the Juno session)

- Whether the workspace runs its own k3d or deploys into a shared dev namespace, and how it reaches the cluster API.
- Whether to run the destructive integration suite (tenant isolation, RLS, purge) in the workspace, which needs Docker + `supabase start`; normal dev and the deployed stack use the managed dev Supabase (ADR-038), so Docker is otherwise unneeded.
- Where the workspace's `INFISICAL_TOKEN` is stored by the platform (a Juno workload secret), so it is never in the repo or a dotfile.
