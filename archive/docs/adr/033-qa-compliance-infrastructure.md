# ADR-033: QA and compliance infrastructure: a four-tier test taxonomy, the auto-audited control chain, and evals as a manual pillar

**Status:** Accepted (built and merged to `dev`, PRs #55 and #56)
**Date:** 2026-06-13
**Related:** Operationalizes ADR-015 (security packet as a day-one deliverable) by making the control register machine-checked instead of hand-maintained. Inherits the eval-gate intent of ADR-009 and ADR-010 (gate apply-then-report on a passing eval set) and ADR-027 (the plain-language register dimension), and records that gate as still deferred. Carries the ADR-020 JWKS/ES256 boundary as an honest CI-coverage gap. The test-layout exception is forced by the ADR-028/031 pane being a Vite/DOM surface. Supersedes the prior shape of [qa-strategy.md](../security/qa-strategy.md), which described a taxonomy the tree did not embody.

## Context

The test suite and the compliance docs grew by accretion. By 2026-06-13 the state was: 23 test files with no documented taxonomy and no structure in the tree (11 integration suites sat flat in `tests/`, unit tests were scattered through `apps/*/src` and `packages/*/src`); three different ways to mint a test JWT, one of them a hand-rolled `node:crypto` token written only because the root `tests/` directory could not resolve `jose`; the same workspace/user/contract setup copied across every integration suite; and integration suites that skipped silently when Supabase was absent, so a run with the database down read as green.

The compliance side had a sound design that had quietly fallen out of date. [control-register.md](../security/control-register.md) is the spine of ADR-015 (claim, then enforced control, then test, then packet doc), but it was hand-maintained, so a week of fast shipping outran it: roughly ten tests had no row, and [qa-strategy.md](../security/qa-strategy.md) still called the agent-eval layer a scaffold and never mentioned real Hermes, the knowledge layer, the pane, or the SSE route. The chain had rotted because nothing enforced it. Two separate development threads tripped over the same `jose` and harness friction, which is what surfaced the problem.

## Decision

Rebuild QA and compliance into a system that is both maintainable (the friction is gone and the structure is legible) and auditable (the chain cannot silently drift again).

### 1. A two-axis test taxonomy, embodied in the tree

Every test carries a **tier** (where it lives and how it runs) and a **purpose** (what trust property it proves).

| Tier | What | Where |
| --- | --- | --- |
| 1 Unit | Pure logic, no I/O | `tests/unit/` |
| 2 Integration | Real Postgres or socket, multiple components | `tests/integration/` |
| 3 Eval | Probabilistic, scored, model-dependent | `evals/` (manual) |
| 4 Manual / probe | Observable only in a real host | `docs/runbooks/` |

The node-world tests are centralized under `tests/{unit,integration}` so the directory states the taxonomy. **The one deliberate exception is browser-surface tests:** the pane's `apps/pane/src/**/*.test.ts` stay co-located with their app because they compile in the pane's Vite environment (bundler module resolution, extensionless imports, `import.meta.env`, DOM and Office types), which the node-based `tests/` tsconfig cannot host without recreating the pane's build config. The monorepo has two compilation worlds; the test layout honors that rather than fighting it. Evals are kept separate as Tier 3 because they are a different discipline (scored, model-dependent, run by hand), not a deterministic assertion that gates a merge.

### 2. One shared integration harness

Tier 2 setup lives once, in `tests/integration/helpers.ts`: `requireSupabaseEnv()` (the single env gate, which logs a visible warning so an absent database reads as SKIPPED, never as silent green), `seedWorkspace()` (workspace, owner, membership, active contract), and `mintToken()` (the one canonical HS256 test token). `jose` and `@cormac/shared` are declared as root devDependencies so the centralized tests resolve them; centralizing tests pulls the workspace dependencies they use up to the root, and that is the explicit cost of a legible tree.

### 3. The control register is machine-checked

`check:controls` ([scripts/check-control-register.ts](../../scripts/check-control-register.ts), a CI gate beside `check:rls` and `check:secrets`) parses the register's markdown table and fails the build when a cited test file is missing, a `tested` row cites no test, or a repo test is neither cited nor on an explicit `QA_EXEMPT` allowlist. It is **fail-loud**: a path-shaped token written without backticks is an error, never a silent skip, so the meta-check cannot itself drift. The exemption allowlist is policed by one rule: an exemption is only for a test of correctness of non-compliance logic (a byte-stable renderer, a pure classifier, a stub fixture); any test touching auth, tenant isolation, audit, the write gate, or redaction must have a register row.

### 4. Evals stay a manual pillar

Evals do not gate PRs. They are non-deterministic, cost model budget, and need a real model, so a per-PR gate is the wrong instrument. The only eval-related CI step is `check:eval-fixtures`, a zero-model structural check that every golden parses and every fixture loads. The eval gate that the design does call for, blocking a workspace from switching to apply-then-report until its eval set passes (ADR-009, ADR-010, REQ-027A), remains deferred and is documented as such.

### 5. Honesty about what the guard proves

The register and the strategy doc state the boundary plainly: the guard proves the chain is wired (existence, citation, no orphans), not that a cited test exercises its control (miscitation is a review responsibility) and not that the production path is covered. CI exercises the HS256 token branch that local Supabase uses; production verifies ES256 against the JWKS (ADR-020), and that branch is verified manually. This is recorded as a known gap on the register rather than smoothed over, consistent with the project's skepticism toward green checkmarks.

## Consequences

- The claim-to-control-to-test chain cannot silently fall out of sync with the tree again; a new control without a test, or a new test without a home, fails CI.
- M2 and every later milestone build on the shared harness and the taxonomy. Adding a control means adding a register row; adding a test means citing it or exempting it with a reason.
- CI gained two static gates (`check:controls`, `check:eval-fixtures`). The full suite remains 124 passing against live local Supabase.
- The pane test co-location is now a documented standing rule, not an oversight, and it generalizes to any future Vite surface (for example an Outlook host).
- The reconciliation closed the orphan-test gap left when the M1 pane work merged ahead of the guard; rows 24 through 28 of the register were added and the SSE and pane tests brought under it.

## Alternatives considered

**Leave the docs hand-maintained and just refresh them.** Rejected. The register had already rotted once precisely because nothing enforced it; a refresh without a guard would rot again on the next fast week.

**Centralize every test, including the pane's.** Rejected. The pane compiles under Vite with bundler resolution and DOM/Office types; its tests cannot type-check under the node `tests/` tsconfig without recreating the pane's build config inside the test tree, which trades one inconsistency for a worse one. Co-location is the principled exception, and the taxonomy doc says why.

**Keep unit tests co-located with their source (the hybrid).** A legitimate convention, and the original posture. The team chose a single legible `tests/` tree; co-location is retained only where the toolchain forces it (the pane).

**A separate machine-readable register (YAML or JSON) generating the markdown.** Rejected. Parsing the existing human-authored table keeps one source of truth with no duplication, and fail-loud parsing removes the drift risk that a sidecar would reintroduce.

**Gate evals in CI, or run a small eval subset per PR.** Rejected. Non-determinism, cost, and the need for a real model make eval scoring a poor merge gate. The structural fixture check is the only zero-cost piece that belongs in CI; the real gate attaches to the apply-then-report switch and is deferred.

## Open items

1. **Production auth-path coverage.** CI exercises HS256 only; ES256/JWKS verification is manual. Closing this needs either a CI step that mints ES256 tokens against a JWKS or an accepted standing manual check.
2. **The apply-then-report eval gate** (ADR-009, ADR-010, REQ-027A) is unbuilt; the manual eval pillar is documented, the gate logic is not.
3. **The deny-hook CI test (#44)** is still filed, so register row 22 stays at "manual evidence" until it lands.
4. **Tier 4 has one inhabitant** (the pane-sideload runbook). It populates as the Juno deploy/smoke steps (M5), the SMS opt-out checks (M6), and the backup/restore drill (register row 17) arrive.
5. **The guard checks wiring, not coverage depth.** Miscitation and shallow tests remain a human review responsibility; the guard does not and cannot catch them.
