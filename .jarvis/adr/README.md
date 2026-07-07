# ADR Contract

This folder contains architectural and project decisions.

Sequentially numbered, never-deleted records on a Context→Decision→Consequences→Alternatives spine, written at "decision-level but named-topic-concrete" altitude, with mandatory honest cost accounting and an explicit supersedes/amends graph in the headers — length scaling to the decision's weight, evolution and reasoning needed. 

## File Naming

Use ordered filenames:

```text
0001-decision-title.md
0002-next-decision.md
```

## Required Shape

Each ADR should include:

- Status
- Context
- Decision
- Consequences
- Alternatives considered
- Supersession notes, if any

## Rules

- Write an ADR only when a decision is settled.
- Mark superseded ADRs clearly.
- Do not reopen active ADRs unless new evidence changes the decision.
- Prefer one strong ADR over many weak notes.
- Prefer an ADR when a constraint or implementation mechanism represents a settled fork with rejected alternatives, durable rationale, and consequences future agents should not casually relitigate.
- Do not write ADRs for ordinary implementation churn, transient experiments, or facts that merely describe current code.
- If an ADR changes project truth, update or reference the relevant PRD file without duplicating the whole decision.
