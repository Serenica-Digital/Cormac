# Agent evals

The agent is probabilistic, so it is evaluated against golden cases, not unit-asserted. This directory is the harness for that (QA taxonomy layer 4, see [../docs/security/qa-strategy.md](../docs/security/qa-strategy.md)).

A case is an input message plus the expected proposal shape (op, object, matched vs new record, which fields). The set grows from real corrections (ADR-009): a rejected or corrected proposal becomes a new case so the same mistake is caught next time.

## What is here now

- `cases.ts`: a few starter cases.
- `run.ts`: a runner that feeds each case through the agent and scores it. Run with `pnpm evals`.

## Important caveat

Today the runner exercises the deterministic **runtime stub**, so it proves the harness, not the agent. Real evals run against real Hermes and measure extraction precision/recall, matching accuracy, disambiguation, and overreach. The gate that a workspace must pass before enabling apply-then-report (ADR-009) attaches to the real-Hermes scores, not the stub.
