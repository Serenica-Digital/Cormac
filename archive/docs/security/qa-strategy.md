# QA Strategy

> **Status:** canonical · **Last reviewed:** 2026-06-14

QA in a contract-first, multi-tenant CRM agent is not "does the feature work." It is "do the trust invariants hold for arbitrary tenant data, and does the agent propose correctly." Those are two different problems: the first is deterministic and must never regress; the second is probabilistic and needs evaluation, not assertion. This doc describes how we test both, where the tests live, and which gate a release.

The organizing rule matches the security packet (ADR-015): a control is not real until a test proves it. [control-register.md](control-register.md) is the source of truth for which controls are real; a static guard keeps that register honest (see [The control chain and its guard](#the-control-chain-and-its-guard)). This doc is the engineering companion: the test tiers, the shared harness, and the gates.

## Test taxonomy: two axes

Tests are classified on two axes. The **tier** says where a test lives and how it runs; the **purpose** says what trust property it proves. Every test has both.

### Axis 1 — tier (where it lives, how it runs)

| Tier | What it is | Where it lives | Runs |
| --- | --- | --- | --- |
| 1 Unit | Pure logic, no I/O (no DB, no socket) | `tests/unit/` (browser-surface tests stay co-located in `apps/pane/src`, see below) | anywhere, fast, every PR; no Docker |
| 2 Integration | Real Postgres and/or a real socket, multiple components wired | `tests/integration/` | needs local Supabase; every PR in CI |
| 3 Eval | Probabilistic, scored, model-dependent | `evals/` | manual only; see [The agent eval pillar](#the-agent-eval-pillar-tier-3) |
| 4 Manual / probe | Behavior only observable in a real host (Excel/Office) | M1 pane probes, [docs/runbooks/](../runbooks/) | human-run, scripted |

The rule, now embodied in the tree: **Tier 1 unit tests live in `tests/unit/`; Tier 2 integration tests live in `tests/integration/`.** A test that needs `createServiceClient`, a workspace, or a token is Tier 2; a test that imports a pure function and asserts its output is Tier 1. The one deliberate exception: **browser-surface tests stay co-located with their app** (the pane's `apps/pane/src/**/*.test.ts`). They compile in the pane's Vite/DOM environment (bundler module resolution, `import.meta.env`, DOM and Office types), which the node-based `tests/` tsconfig cannot host without recreating the pane's build config. So the pane keeps its tests; everything node-world is centralized.

There is no automated end-to-end (browser) tier today. The real-host end-to-end story is Tier 4 (manual pane probes); an automated Playwright layer is deferred to M3, when the pane is a product rather than a spike and a generic Chromium run would still not answer the WebView2/WKWebView questions M1 exists to measure.

### Axis 2 — purpose (what trust property it proves)

These are the categories a reviewer cares about. Each maps onto Tier 1 or Tier 2.

1. **Contract and field gates (Tier 1).** The agent-editability and type gate and the sensitivity helpers, the cheapest and most load-bearing logic tests. `tests/unit/validate.test.ts` (no human-only field, no wrong type, no bad enum, no unknown field; create requires required fields); `tests/unit/redact.test.ts` (sensitive values stay out of the model context and are masked in logs); `tests/unit/runtime.test.ts` (malformed runtime output is rejected at the adapter, never written).

2. **Trust invariants (Tier 2, must never regress).** These prove the boundary, not a feature. Tenant isolation, a user in workspace B cannot read or write workspace A's rows (`tests/integration/isolation.test.ts`); the control plane is the only writer (the isolation write-denied case; the runtime gets no DB credentials in the [hermes-runtime chart](../../plugins/hermes-runtime/values.yaml)); append-only audit (the isolation append-only case); the RBAC matrix, every protected endpoint times every role (`tests/integration/rbac-matrix.test.ts`); authn, every protected endpoint rejects a missing or invalid JWT.

3. **Pipeline and knowledge spine (Tier 2, against a real DB).** The full capture → validate → confirm → write → audit thread (`tests/integration/pipeline-integration.test.ts`); atomic apply and all-or-nothing rollback (`tests/integration/atomic-apply.test.ts`); the MCP tool surface, auth, allowlist, and the write gate (`tests/integration/mcp-tools.test.ts`); the contract publish gate, server-authoritative, atomic, audited, invalid and direct-call refused (`tests/integration/contract-publish.test.ts`); the learned-knowledge gate, proposed-is-invisible, approve activates and audits, revoke reopens the slot, stale items refused (`tests/integration/learning-lifecycle.test.ts`); the compiled context prefix, only active gated items, aliases resolved, sensitive values excluded, byte-stable (`tests/integration/context-compile.test.ts`); workspace purge, deliberate and service-role-only (`tests/integration/workspace-purge.test.ts`).

4. **The agent (Tier 3, eval, not assertion).** See [the eval pillar](#the-agent-eval-pillar-tier-3). You do not unit-assert a probabilistic agent; you evaluate it against golden cases and watch the score.

5. **Security and abuse (Tier 1 and Tier 2).** Secrets never appear in source or the browser bundle (CI `check:secrets`); CORS is an allowlist and 5xx error detail is withheld (`tests/unit/server.test.ts`); the SSE capture surface enforces the same authz chain as `/capture` and never leaks error detail (`tests/unit/capture-stream.test.ts`, `tests/integration/sse-stream-integration.test.ts`); injection, contract-gate-as-backstop, and per-surface authenticity tested per surface as it lands.

6. **Non-functional (Tier 2 and manual).** Runtime latency budget for the capture round-trip; failure injection, runtime down and mid-way apply failure (`tests/integration/atomic-apply.test.ts`); the backup/restore drill (manual, pending).

## The shared integration harness

Every Tier 2 suite stands up the same shape: a workspace, an owner user, a membership, an active contract, sometimes a token. That setup lives once, in [tests/integration/helpers.ts](../../tests/integration/helpers.ts), not copied per file:

- `requireSupabaseEnv()` — the single env gate. Returns the Supabase env or a `ready=false` flag, and logs one visible warning when the env is absent, so a run with Supabase down reads as **SKIPPED**, never as a silent green pass.
- `seedWorkspace(service, opts?)` — creates workspace + owner + membership + active contract (+ optional records) and registers them for cleanup via `TestResources`.
- `mintToken(sub, opts?)` — the one canonical test token, an HS256 JWT signed against `SUPABASE_JWT_SECRET` with the right issuer and `aud=authenticated`.

`mintToken` standardizes what used to be three different approaches (Supabase `signInWithPassword`, a hand-rolled `node:crypto` HMAC, and `jose` `SignJWT`). The hand-rolled path existed only because root `tests/` could not resolve `jose`; `jose` is now a root devDependency, so `tests/` imports it the same way `apps/api` does. Note the honest limit: `mintToken` exercises the **HS256** verification branch, the one local Supabase uses. Production verifies **ES256 against the JWKS** (ADR-020); that branch is covered manually, not in CI (control-register, known gaps).

## Quality gates (what blocks a merge or a pilot)

CI ([ci.yml](../../.github/workflows/ci.yml)) runs, in order: `pnpm install --frozen-lockfile`, lint, typecheck, build, then the static guards, then Supabase plus the full test suite:

- **`check:rls`** — every table in the public schema has RLS enabled; a new table without it fails CI.
- **`check:secrets`** — no service-role key or other secret in committed source or the web bundle.
- **`check:controls`** — the control-register guard (below).
- **`check:eval-fixtures`** — every eval golden parses and every fixture loads (structural only, zero model calls; see the eval pillar).
- **the full test suite** — Tier 1 + Tier 2, after `supabase start` exports the DB env.

A release to a real-data pilot additionally requires the day-one acceptance gate below to be all-green or explicitly risk-accepted.

## The control chain and its guard

The chain is: a claim a reviewer asks about → an enforced control in code → a test that proves it → a packet doc. [control-register.md](control-register.md) is that chain as a table. It rotted once because it was hand-maintained while the code moved fast, so the chain is now machine-checked.

**`check:controls`** ([scripts/check-control-register.ts](../../scripts/check-control-register.ts)) parses the register and fails the build when: a cited test file does not exist; a `tested` row cites no test; or a `*.test.ts` in the repo is neither cited nor on the guard's `QA_EXEMPT` allowlist. Exemptions are policed by one rule, stated in the register: an exemption is only for a test of **correctness of non-compliance logic** (a byte-stable renderer, a pure classifier, a stub fixture); anything touching **auth, tenant isolation, audit, the write gate, or redaction** must have a register row.

What the guard does **not** do, stated plainly because the project distrusts green checkmarks: it proves existence, citation, and no-orphans. It does not prove a cited test actually exercises its control (miscitation is a review job), and it does not prove production-path coverage (the HS256-vs-ES256 gap above). The guard stops drift, not miscoverage.

## The agent eval pillar (Tier 3)

The agent is probabilistic, so it is evaluated, not asserted, against a growing set of golden cases. This is a first-class QA pillar and it is **deliberately manual**: eval runs are non-deterministic, need a real model (`ANTHROPIC_API_KEY`) and real budget, and are not a CI gate. Details, run commands, and what each harness measures live in [evals/README.md](../../evals/README.md). Two structural facts belong here:

- **It is not a merge gate, by decision.** Confirm-each needs no eval gate, because a human approves every write. The gate that does exist in the design (ADR-009/010, REQ-027A) governs one thing: a workspace may not switch to apply-then-report until its eval set passes a threshold. That gate is not built.
- **Only structural fixture validation runs in CI** (`check:eval-fixtures`): goldens parse via `parseContract`, fixtures load. No model calls, no scoring. This catches a broken golden or schema drift before someone burns an eval run on it, without making evals a gate.

The workbook-contract harness is about to change shape: M2 takes it from one-shot to a multi-turn interview with new scoring dimensions. This doc and the eval README describe the pillar at the principle level for that reason; the current harness mechanics live in `evals/` and will move.

## Day-one acceptance gate (ADR-015), with current status

The ADR-015 checklist rendered as a gate. Status is reconciled against the control register.

| Criterion | Status |
| --- | --- |
| Workspace scoping on all tenant data | met; `tests/integration/isolation.test.ts` (register 1) |
| RLS policies for tenant-scoped tables | met; isolation test + `check:rls` (register 1, 11) |
| Cross-tenant access tests exist | met; passing in CI |
| Control plane verifies JWT + workspace role on protected endpoints | met; `tests/integration/rbac-matrix.test.ts` (register 9, 10), HS256 path in CI / ES256 manual |
| Agent runtime has no write credentials | met (hermes-runtime chart; register 3) |
| Agent tools allowlisted by workspace | met + tested; `tests/integration/mcp-tools.test.ts` (register 20) |
| Agent outputs validated before writes | met + tested (register 4, 5, 21) |
| Proposal/approval/apply write audit events | met for apply (register 7); revert + admin + agent-action audit still open (#42) |
| Knowledge layer is gated and compiled control-plane-side | met + tested; `tests/integration/learning-lifecycle.test.ts`, `tests/integration/context-compile.test.ts` (register 25, 26) |
| Secrets out of code, not logged | partial: `check:secrets` scan; masking helper applied at zero log sites (register 12, 13, #41) |
| Backups configured + one restore path documented | pending: tested drill (register 17) |
| Subprocessor list + AI data-handling accurate for pilot | met (drafted) |
| Graph permissions documented before consent | pending: connector (register 15) |
| SMS consent/opt-out documented before texting | pending: surface (register 16) |

## What runs without Docker vs after

- **Now (no DB):** all Tier 1 tests; lint, typecheck, and the static guards (`check:rls`, `check:secrets`, `check:controls`, `check:eval-fixtures`). Green today.
- **After local Supabase:** all Tier 2 tests. They skip cleanly and loudly without a database (the `requireSupabaseEnv` warning), following the pattern in [tests/integration/isolation.test.ts](../../tests/integration/isolation.test.ts).
- **Manual:** Tier 3 eval runs (with an API key) and Tier 4 pane probes (in real Excel).
