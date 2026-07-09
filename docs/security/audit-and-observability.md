# Audit and observability

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

## The audit trail (rows 13-15 — Verified)

`audit_events` is append-only, enforced by a database trigger that refuses
updates unconditionally and deletes except through the sanctioned purge
path. Every event carries actor type and id, action, before/after values,
and links to the source message and proposal that produced it.

What is audited today:

- **Record changes** — written in the same transaction as the record itself
  (the `apply_proposal` function), so an applied change without its audit
  event cannot exist.
- **Contract publishes** — version bump, active flip, and audit in one
  transaction.
- **Administration** — members added/role-changed/removed, workspaces
  provisioned, agent tokens revoked; each with the acting user.

The trail is deliberately unredacted (see
[data-handling.md](data-handling.md)): a true record needs true values. It
is protected by RLS like any tenant data, and surfaced to clients in the
product as "History".

## Named gap: agent actions

Proposal *submission* by the agent writes no audit event today
(`actor_type='agent'` exists in the schema and is unused) — the trail
records what was applied and decided, not the agent's submission itself.
Carried over from v0 (issue #42 there); listed in
[known-gaps-and-roadmap.md](known-gaps-and-roadmap.md).

## Observability

HTTP-level structured logging (Fastify/pino) with 5xx detail kept
server-side (row 21 — Partial). No metrics, alerting, or centralized log
retention yet — Planned, and a pilot prerequisite named in the roadmap.
