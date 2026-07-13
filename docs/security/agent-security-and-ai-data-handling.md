# Agent security and AI data handling

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

## What the agent is

Two agents run on the Hermes runtime: an **authoring** agent that interviews
the client and drafts their contract, and an **operations** agent that turns
everyday utterances into proposed record changes. Both reach the system only
through the control plane's `/agent/*` surface.

## What binds them (register rows 3-6)

- **A scoped token, not a database credential.** The runtime environment
  holds one agent token per lane and no Supabase keys (row 3 — Partial:
  config-review evidence, no automated env lint yet).
- **One workspace per token.** The token's hash binds it to a single
  (workspace, agent kind); no tenant id travels in a path (row 4 — Verified).
- **A privilege split.** The authoring token cannot submit record proposals;
  the operations token cannot publish contracts (row 5 — Verified).
- **Hashed at rest, revocable, indistinguishable when dead.** Only the
  SHA-256 hash is stored; revocation is immediate through the operator
  surface; unknown and revoked tokens both read as plain 401 (row 6 —
  Verified).

## What the agent can never do (row 12 — Verified)

Write. Its proposals are held `pending` and become record changes only when
a human with the approve capability decides — atomically, with an audit
event (row 13). Contract drafts pass the same validating publish gate as a
human's (row 16). The runtime executes no shell and holds typed,
schema-validated tools only (hardened in PR #72; posture, not a rowed test).

The same gate governs what the agent learns (row 29 — Verified). The
runtime's own memory stays off; the agent may only STAGE a typed vocabulary
fact (a record alias or an enum synonym — never free text) for review, and
the fact reaches the model's context only after a human approves it. Both
decisions are audited. This is the "authenticated memorization" mitigation
the external red-team literature recommends against memory-poisoning
attacks.

## What the model sees (row 17 — Verified)

Data minimization is a contract property: any field a tenant marks
`sensitive` is excluded from the model-facing context on every agent record
read, even when it is an identity field. Proven by
`apps/control-plane/tests/redact.test.ts`. The audit trail is deliberately
NOT redacted — it must hold true before/after values to be a real record,
and it lives in the database under RLS, not in logs.

What does reach the model: non-sensitive identity fields for matching, the
published contract, the user's own utterances, and workbook detection
profiles (see [data-handling.md](data-handling.md) for exactly what a
profile contains).

## Model providers

Agent inference runs on the runtime's configured model provider. Provider
data-use terms (training, retention) are recorded in
[subprocessors.md](subprocessors.md) with their verification status — this
packet does not assert terms from memory.
