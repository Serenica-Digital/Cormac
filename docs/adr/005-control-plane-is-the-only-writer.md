# ADR-005: The control plane is the only writer

**Status:** Accepted
**Date:** 2026-06-06
**Related:** The trust spine of the product. ADR-007 (one agent service, many doors) is how every surface reaches it, ADR-010 (configurable confirmation) is the policy it applies, ADR-006 (Hermes runtime) is contained beneath it, ADR-009 (govern learning as data) keeps intelligence in it, and ADR-015 (security) treats this boundary as the central control to evidence.

## Context

The product's headline feature is agent-driven writes to business data, including fire-and-forget capture by text where the user expects to send a message and have the CRM update itself. That is also the single scariest thing to an enterprise IT reviewer, and it is precisely the line the frontier labs decline to cross: the Anthropic analytics stack is read-only and human-gated, and they say the silent plausible-but-wrong answer is unsolved (see [docs/research/anthropic-self-service-analytics-and-skills.md](../research/anthropic-self-service-analytics-and-skills.md)). Our product thesis is the write-back loop (ADR-001), so we are deliberately building past the line they stop at, which means the safety scaffolding is the product, not decoration.

The architecture has to make two things true at once: the agent can update the CRM automatically for opted-in users, and the agent runtime never holds the keys to the database. The way to hold both is a precise trust boundary and precise language. "The agent cannot write" is wrong and undersells the product. The accurate claim is that the agent runtime cannot write directly. Whether a validated, agent-originated change is applied immediately is a control-plane policy, not a capability of the runtime.

## Decision

The Serenica control plane (a Node/TypeScript API plus workers) is the only thing that writes business records.

### 1. Surfaces and the runtime only propose

Surfaces submit drafts and commands. The runtime returns structured proposed changes as untrusted output. Neither holds database write credentials. The runtime can interpret, match, and structure; it cannot mutate.

### 2. The control plane validates, then writes

It validates each proposed change against the active contract (ADR-002), the user's permissions (ADR-011), and risk rules, then applies it per the workspace confirmation policy (ADR-010), and records an audit event with before-and-after values and source links.

### 3. The write modes

| Mode | User experience | Architecture |
| --- | --- | --- |
| Confirm-each | Agent proposes, user replies to approve | Control plane applies after confirmation |
| Apply-then-report | User fires and forgets | Control plane auto-applies eligible validated output, audits it, includes it in the weekly report |
| High-risk actions | Always require explicit confirmation regardless of mode | Schema and contract changes, deletes, bulk updates, permission changes |

Opt-in auto-apply is a policy, not a hole in the trust model. In apply-then-report mode the control plane permits certain validated, agent-originated changes to auto-apply immediately. From the user's seat that is fire-and-forget. From the security seat the agent does not have write access; the control plane permits opted-in auto-apply under an explicit workspace policy. Both statements are true at once, and the language in every doc should preserve the distinction.

### 4. MCP is not the internal write path

Writes from SMS, web, and Excel go straight through the control-plane API. MCP is only the external connector surface for an outside AI (ADR-007). The concrete SMS fire-and-forget path makes this clear:

```
User texts the Twilio number
  -> Twilio webhook hits the control plane
  -> control plane verifies sender and workspace
  -> control plane invokes the runtime
  -> runtime returns structured change JSON
  -> control plane validates against contract, permissions, risk
  -> control plane writes to Supabase, per the confirmation policy
  -> control plane writes an audit event
```

No MCP anywhere in that loop. RLS and database constraints are a backstop (ADR-003), not the authorization gate.

## Consequences

- Because there is exactly one writer, there is exactly one command and proposal pipeline, and no surface reimplements write logic (ADR-007). The same internal capabilities (capture an update, apply a proposal, write an audit event) are called by every adapter.
- The runtime is contained: its output is untrusted until the control plane validates it with Zod, which is the boundary the Agent Runtime Adapter defines (ADR-006) and the containment the security packet evidences (ADR-015).
- Audit and learning are control-plane responsibilities, governed as data rather than runtime memory (ADR-009).
- This is the design that makes the trust-boundary diagram legible to enterprise IT (surfaces untrusted, connectors verified at ingress, control plane owns authority, runtime cannot write, RLS as backstop). Legible is not the same as passing; passing requires the evidence in ADR-015.

## Alternatives considered

**Let the runtime write directly to the database.** Simplest to wire. Rejected because it fails IT review, hands database credentials to a pre-1.0 runtime with a documented persistent-memory injection vector that our inbound SMS and email exactly trigger (ADR-006), and removes the single point where contract, permission, and risk validation happen. The whole trust story collapses if the runtime can mutate state.

**Route writes through an MCP server we build.** Considered because MCP came up as the Claude surface, and it is easy to assume "agent writes" implies "MCP writes." Rejected as the internal mechanism: MCP exists to let an external AI call our tools (ADR-007), and the SMS, web, and Excel write paths need none of it. The control-plane API is the write path; MCP is one more adapter in front of it.

**No auto-apply, approve everything.** Safe, and it kills the selling point the partner cares about most (ADR-001). Rejected in favor of a configurable setting (ADR-010) where auto-apply is opt-in, always audited, and reversible.

## Open items

1. **The confidence question.** Ambiguous or uncertain changes route to review even in apply-then-report mode. Today the mechanism is the agent self-flagging uncertainty and ambiguous entity matches going to clarification. Whether that becomes a formal confidence score with a threshold, and what would generate that score (entity-match certainty, schema-validation strictness, or the agent's own flag), is an open design question and is not a built mechanism. It should not be written as if it exists. Tracked jointly with ADR-010, and it connects to how identity rules are expressed in ADR-002.
2. **Reversibility scope.** Which applied changes are cleanly reversible (simple field updates) versus which are not (merges, deletes), and how reversal events are themselves audited.
