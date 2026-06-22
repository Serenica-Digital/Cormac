# Agent evals

The agent is probabilistic, so it is evaluated against golden cases, not unit-asserted. This directory is the harness for that. In the QA taxonomy it is **Tier 3** ([../docs/security/qa-strategy.md](../docs/security/qa-strategy.md)): a first-class pillar that is **deliberately manual**.

## Manual by design (not a CI gate)

Eval runs are non-deterministic, need a real model (`ANTHROPIC_API_KEY`) and real budget, and measure quality rather than asserting a boundary. So they do not gate PRs. Confirm-each needs no eval gate because a human approves every write. The one gate that does exist in the design is narrow and **not yet built**: a workspace may not switch to apply-then-report until its eval set passes a threshold (ADR-009, ADR-010, REQ-027A). The trigger to revisit "evals stay manual" is that gate becoming real, or evals becoming cheap and deterministic enough to run per-PR. Neither holds today.

## What does run in CI

One zero-model check, `check:eval-fixtures` ([../scripts/check-eval-fixtures.ts](../scripts/check-eval-fixtures.ts)): every golden parses via `parseContract` and every fixture loads. This is **structural validation, not scoring** — no model calls, no budget — so it catches a broken golden or schema drift before someone burns an eval run discovering it, without making evals a gate.

## The two harnesses

- **Operations agent** (`cases.ts`, `run.ts`; `pnpm evals`). A case is an input message plus the expected proposal shape (op, object, matched vs new record, which fields). Today the runner exercises the deterministic **runtime stub**, so it proves the harness, not the agent. Real evals against real Hermes measure extraction precision/recall, matching accuracy, disambiguation, and overreach; the apply-then-report gate attaches to those scores, not the stub.

- **Workbook Contract Agent** (`workbook-contract/`; `pnpm evals:workbook`). The keystone feasibility spike for ADR-023: feed a messy workbook to an LLM that must emit a semantic contract and measure how close it gets and whether it knows what it does not know. Runs against a real model. See [workbook-contract/README.md](workbook-contract/README.md) for cases, scoring dimensions, and the PII discipline.

## Deferred (designed, not built — do not read the docs as if these exist)

- The **plain-language register** dimension: a lint over generated questions against a banned-vocabulary list, plus a "would a spreadsheet user understand this" rubric (ADR-027 §6). Not in the scorer.
- The **correction feedback loop**: cases growing automatically from real rejected/corrected proposals (ADR-009) is the goal; today fixtures are hand-authored.
- The **apply-then-report eval gate** itself (ADR-009/010): the harness produces scores; nothing reads them to gate a workspace mode switch.

## Coming in M2 (treat current mechanics as provisional)

M2 rewrites the workbook-contract harness from a one-shot call into a **multi-turn interview** driven by an LLM manager-simulator, with new scoring dimensions (convergence, structural stability across runs, whether it asked the high-stakes questions). The principle stays; the mechanics in `workbook-contract/` will move. This README and the QA strategy describe the pillar at the principle level for that reason.
