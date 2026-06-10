# QA Strategy

QA in a contract-first, multi-tenant CRM agent is not "does the feature work." It is "do the trust invariants hold for arbitrary tenant data, and does the agent propose correctly." Those are two different problems: the first is deterministic and must never regress; the second is probabilistic and needs evaluation, not assertion. This doc describes how we test both, and which tests gate a release.

The organizing rule matches the security packet (ADR-015): a control is not real until a test proves it. The [control-register.md](control-register.md) lists each control and its test; this doc describes the kinds of tests and the gates.

## The testing taxonomy, in priority order

### 1. Contract and unit (deterministic, fast, no DB)

The agent-editability and type gate, and the sensitivity helpers. These are the cheapest and most load-bearing logic tests.

- [validate.test.ts](../../packages/contract/src/validate.test.ts): the agent cannot write a human-only field, a wrong type, a bad enum, or an unknown field; create requires required fields.
- [redact.test.ts](../../packages/contract/src/redact.test.ts): sensitive values stay out of the model context and are masked in logs.
- [runtime.test.ts](../../apps/api/src/adapter/runtime.test.ts): malformed runtime output is rejected at the adapter, not written.

### 2. Trust-invariant tests (the ones that must never regress)

These prove the boundary, not a feature. They are the difference between a design and a passable IT review.

- **Tenant isolation**: a user in workspace B cannot read or write workspace A's rows. [tests/isolation.test.ts](../../tests/isolation.test.ts).
- **Control plane is the only writer**: direct user writes are denied by RLS (no write policies); the runtime has no DB credentials. Covered by the isolation write-denied case and by the runtime getting no Supabase env in [compose](../../docker/compose.yaml).
- **Append-only audit**: audit rows cannot be updated or deleted, even by the service role. Isolation append-only case.
- **RBAC matrix**: every protected endpoint, for every role, allows exactly the capabilities it should and rejects the rest. `tests/rbac-matrix.test.ts`.
- **Authn**: every protected endpoint rejects a missing or invalid JWT.

### 3. Pipeline integration (the spine, against a real DB)

The full thread end to end: capture -> validate -> confirm -> write -> audit. `tests/pipeline-integration.test.ts` asserts the golden path produces a source message, a held proposal, then on approve a business record and an audit row with correct before/after and source link; and that the human-only-gate request is rejected with a 422 at capture, never written.

### 4. Agent eval harness (the part unique to agentic systems)

The agent is probabilistic. You do not unit-assert it; you evaluate it against a growing set of golden cases and watch the score. This is where regressions in agent quality get caught before a client does.

- **Golden cases**: input message + the expected proposal (objects, fields, matched vs new). Stored as data in `evals/cases/`, so the set grows from real corrections (ADR-009).
- **What we measure**: extraction precision/recall (did it find the right fields), matching accuracy (right existing record vs spurious new one), disambiguation behavior (does it flag uncertainty rather than guess), and overreach (does it ever propose a human-only field or invent a field).
- **The gate**: a workspace may not switch to apply-then-report until its eval set passes a threshold. Gate the agent before you trust it (ADR-009). Confirm-each needs no gate because a human approves every write.
- **Status**: only a scaffold and a few cases land now. A real eval run needs real Hermes; the stub is deterministic and proves the harness, not the agent.

### 5. Security and abuse tests

- Secrets never appear in logs (the sensitivity masking helper, plus a CI scan that no service-role key or secret is committed).
- Injection: JSONB field values and the user's free text cannot break the query or the proposal validation; prompt-injection in the message cannot make the agent exceed the contract (the contract gate is the backstop).
- Per-surface authenticity: each inbound connector verifies the provider (Twilio webhook signature, etc.) before it maps to a workspace. Tested per surface as it lands.
- Rate limits and payload caps.

### 6. Non-functional

- Runtime latency budget for the seam (the capture round-trip).
- Failure injection: runtime down (adapter returns 502, nothing written), mid-way apply failure (atomic rollback, proven by tests/atomic-apply.test.ts), DB errors.
- The backup/restore drill: restore to a clean environment and confirm RLS and the audit trail survive.

## Quality gates (what blocks a merge or a pilot)

CI ([ci.yml](../../.github/workflows/ci.yml)) runs, in order: lint, typecheck, build, then starts Supabase and runs the full test suite including the isolation, RBAC, and pipeline tests. Plus two lints:

- **RLS-enabled check**: every table in the public schema has RLS enabled. A new table without RLS fails CI.
- **No-client-side-secrets check**: the service-role key and other secrets never appear in committed source or in the web bundle.

A release to a real-data pilot additionally requires the day-one acceptance gate below to be all-green or explicitly risk-accepted.

## Day-one acceptance gate (ADR-015), with current status

This is the ADR-015 checklist rendered as a gate. Status reflects the skeleton today.

| Criterion | Status |
| --- | --- |
| Workspace scoping on all tenant data | met (schema) |
| RLS policies for tenant-scoped tables | met; isolation test passes |
| Cross-tenant access tests exist | met; passing live |
| Control plane verifies JWT + workspace role on protected endpoints | met (JWKS, ADR-020) |
| Agent runtime has no write credentials | met (compose) |
| Agent tools allowlisted by workspace | partial: tool model not built yet |
| Agent outputs validated before writes | met + tested |
| Proposal/approval/apply/revert/admin write audit events | partial: revert + admin not built (apply is atomic) |
| Secrets out of code, not logged | partial: masking helper exists; CI scan added |
| Backups configured + one restore path documented | pending: drill |
| Subprocessor list + AI data-handling accurate for pilot | met (drafted) |
| Graph permissions documented before consent | pending: connector |
| SMS consent/opt-out documented before texting | pending: surface |

## What runs without Docker vs after

- **Now (no DB)**: taxonomy layers 1 and parts of 5; lint and typecheck. These are green today.
- **After Docker/local Supabase**: layers 2, 3, and the DB parts of 5/6. Their tests exist and skip cleanly without a database, following the pattern in [tests/isolation.test.ts](../../tests/isolation.test.ts).
- **After real Hermes**: layer 4 beyond the scaffold.
