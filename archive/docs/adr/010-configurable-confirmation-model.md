# ADR-010: Configurable confirmation model; the weekly report as safety net

**Status:** Accepted (the mechanism); the pilot default mode and the confidence gate are open
**Date:** 2026-06-06
**Related:** Defines the policy that ADR-005 (the control plane is the only writer) applies. The weekly report harvests corrections for ADR-009 (govern learning as data), the per-field risk overrides it anticipates live in ADR-002 (the contract), and it is the user-facing expression of the write-back loop that ADR-001 makes the thesis.

## Context

The partner wants low-friction, fire-and-forget interaction: text the CRM and let it update itself without confirming every change. That preference was stated plainly, including that the partner does not personally want approval friction. The product also needs trust and oversight, because a user cannot simply turn the agent loose with no way to see what it did. Earlier framing treated these as a tension to resolve with policy. The cleaner reading is that the friction question is one user setting, not an architecture. Two people can want opposite defaults, and a single toggle serves both.

The SMS research adds a sharper version: confirmation can be risk-tiered rather than binary. Read-only questions answer immediately, low-risk notes and tasks can auto-apply if policy allows, high-impact record changes go proposal-first, and schema, permission, and integration changes never happen by SMS at all (see [docs/research/sms-first-interface-and-compliance.md](../research/sms-first-interface-and-compliance.md)).

## Decision

A single configurable confirmation setting, per workspace and overridable per user.

### 1. Two modes

- **Confirm-each.** The agent texts back the proposed change and applies it only on a "yes" reply. Reply-only, no PIN.
- **Apply-then-report.** The agent applies eligible changes immediately, with no per-update confirmation, and the weekly change report plus reminders provide oversight. This is the mode the partner leaned toward.

### 2. Both modes audit and stay reversible

Every applied change writes a full audit event with before-and-after values and source links, in either mode, and is reversible where safe (ADR-005). The mode changes the confirmation friction, never the auditability.

### 3. Defaults and hard gates

New workspaces default to confirm-each, so trust is earned before friction is removed. High-risk actions (schema and contract changes, deletes, bulk updates, permission changes) always confirm regardless of mode (ADR-005). Schema, permission, and integration changes are never approved by SMS alone.

### 4. The weekly change report is P0

It is the oversight mechanism that makes apply-then-report tolerable, so it is load-bearing, not a nice-to-have. It lists changes since the last report in chronological order, with source channel (SMS, email, web, import, agent), actor, affected records, before-and-after for important fields, and pending proposals or unresolved conflicts. Because the no-confirm mode leans entirely on it, it is a P0 requirement, not a P1 feature.

## Consequences

- The fire-and-forget selling point survives intact, expressed as a setting rather than a special path, and the safety scaffolding (audit, reversal, weekly report) is the product feature that makes stepping over the human-gated line tolerable. This is the concrete answer to the partner's "I want to fire off a text and forget it" ask without abandoning trust.
- The weekly report is also a learning surface: the edits a user makes while reviewing it are corrections that feed the loop (ADR-009).
- A natural and probably necessary extension is risk-tiered confirmation, where the global setting is the default dial and the contract's per-field flags (ADR-002) override it, so a cheap field applies silently while a high-stakes field confirms even in apply-then-report mode. The product half-has this already through the high-risk-actions gate.

## Alternatives considered

**Mandatory approve-each as the only mode.** Safe and simple. Rejected because it removes the fire-and-forget capability the partner cares about most (ADR-001), and it makes the product feel like a slower version of typing the record in yourself.

**No confirmation and no oversight.** Maximum convenience, and the way to become an untrustworthy black box. Rejected: the whole point of the trust model is that a low-friction write loop is still inspectable. The weekly report is what buys the convenience back safely.

**PIN-code SMS approvals as the primary security model.** Considered as a way to authorize writes by text. Rejected as a primary mechanism: it is friction without much real security, and sender plus workspace mapping (ADR-011) already authenticates the channel. Reply-only confirmation is the v1 pattern, and complex or high-risk changes go to web review or the weekly report.

## Open items

1. **The pilot default.** Which mode ships as the design partner's default. The partner leans apply-then-report, but new-workspace-default-confirm-each argues for starting conservative and switching once the operations evals pass (ADR-009).
2. **The confidence gate.** Whether auto-apply is gated by a formal confidence score, or whether self-flagged-ambiguity routing (the current intent) is sufficient. The scoring engine is not built, and what would generate the score is undecided. It must not be written as if it exists (tracked jointly with ADR-005, and tied to how identity rules are expressed in ADR-002).
3. **Per-field risk tiers.** Whether v1 ships the per-field override model or starts with the binary workspace setting plus the high-risk-actions gate, with per-field tiers following once the contract carries the flags.
