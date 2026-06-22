# ADR-009: Govern learning as data; the runtime stays stateless

**Status:** Accepted
**Date:** 2026-06-06
**Related:** Resolves the apparent tension between ADR-006 (run Hermes stateless) and the product promise that the agent learns. The learning lives in ADR-002 (the contract) and ADR-003 (Supabase), is harvested through ADR-010 (the weekly report), and originates from the corrections of ADR-008 (the Operations Agent). It is also the mitigation that makes ADR-006's "memory off" safe.

## Context

"The agent learns" is core to the pitch. It should learn a client's schema, remember the updates made to it, and remember when its proposals were rejected and why, getting sharper per workspace over time. The obvious way to deliver that is to lean on the runtime's own memory. That is the wrong place, and naming why is the point of this ADR.

Hermes runtime memory (its `MEMORY.md`, auto-summarized session memory, and self-authored skills) is opaque, model-curated, free-text, per-profile on disk, non-deterministic, weakly isolated for multi-tenant use, and locked to the runtime. It is also poisonable: the Repello AI threat model shows that content the agent summarizes can plant instructions that persist across sessions, and our inbound SMS and email is precisely that untrusted-input case (ADR-006). Putting the most sensitive thing in the system, what the agent believes about each client's data, into that store is the worst available choice for a governed, auditable, multi-tenant product.

The apparent conflict is that ADR-006 runs the runtime stateless per task. The resolution is that statelessness and learning are not in tension once the learning lives in the right place. The two things both called "memory" are different things.

## Decision

Per-tenant learning lives as governed data in the control plane, and the runtime runs stateless.

### 1. Two memories, and only one of them is ours to keep

- **Governed learning (ours, in Supabase):** the schema contract, field aliases, disambiguation rules, correction history, rejected-proposal patterns, and eval cases. Structured, versioned, auditable, tenant-isolated with workspace IDs and RLS, reviewable, and rollback-able (ADR-002, ADR-003). This is the IP.
- **Runtime memory (Hermes's):** opaque, per-profile, non-deterministic, poisonable, and not built for multi-tenant isolation or audit. Off by default.

The partner's own examples all map to the first kind. "Learns the schema" is the published contract, fed as context each run. "Remembers the updates made" is the source messages, proposals, and audit events, all queryable. "Remembers when updates were rejected" is the correction log. None of them needs runtime memory.

### 2. The correction loop is a product feature

A rejection or edit is captured as structured signal: the source proposal, the correction, the corrected field, the reason or category, whether an alias should change, and whether an eval case should be created. That signal is distilled into proposed contract improvements (a new alias, a sharper identity rule, an eval case), admin-approved, and folded back in through the same review-and-publish gate as any contract change (ADR-002, ADR-008). The system gets smarter per workspace, and every lesson is an inspectable, versioned artifact.

### 3. The runtime stays stateless, and still appears to learn

Persistent runtime memory is off. Each invocation is handed the current contract plus relevant correction history as context, so the agent appears to learn because the data fed to it is accumulating and improving, while the runtime itself remembers nothing between tasks. Runtime memory is reserved at most for short-lived continuity within a single multi-turn session, such as an SMS back-and-forth.

## Consequences

- Auditability and compliance: a client or a reviewer can see what the agent learned, who approved it, and which contract version it took effect in, and a bad lesson can be rolled back. That is impossible with an opaque memory blob, and it is part of the security story (ADR-015).
- Determinism and trust: behavior changes only through a human-gated publish, never through emergent drift. Silent behavior shift because the runtime "learned" something is the exact silent-plausible-but-wrong failure the trust model exists to prevent (ADR-005).
- Multi-tenant isolation: the most sensitive per-client knowledge lives in Supabase under `workspace_id` and RLS, not in a per-profile, poisonable store.
- Portability: governed learning survives a runtime swap, which preserves the contained-and-reversible property that made adopting Hermes safe (ADR-006). Lessons trapped in runtime memory would lock us to Hermes.
- This is the same move that mitigates ADR-006's two scariest risks: with memory off and a fresh session per task, the leak has nothing to grow and injection has nothing to persist into.

## Alternatives considered

**Use the runtime's memory for durable learning.** The path of least resistance, and the thing the runtime is most designed for. Rejected on every axis above: unauditable, non-deterministic, weakly isolated, poisonable, and locked to the runtime.

**Let the agent self-author skills.** Hermes supports it. Rejected because unreviewed, model-authored behavior change is dangerous in a governed CRM. Behavior changes go through the same human-gated review as contract changes.

**Pour history into a vector store and retrieve.** Rejected on evidence, not taste. The Anthropic analytics work found that feeding the agent thousands of past queries moved accuracy by under a point while structure improved it, and that auto-generating definitions with the model encoded the very ambiguities they were trying to remove (see [docs/research/anthropic-self-service-analytics-and-skills.md](../research/anthropic-self-service-analytics-and-skills.md)). Structure beats raw retrieval, and definitions stay human-owned.

## Open items

1. **Auto-suggest versus approve.** Which corrections automatically propose an alias or rule change versus which require explicit admin approval, and how aggressive the distillation should be.
2. **Eval gating.** Which eval cases must pass before a workspace is allowed to switch into apply-then-report mode (ADR-010), borrowing the "gate the agent before you trust it" discipline from the Anthropic work.
3. **Context selection.** How "relevant correction history" is chosen per task without re-introducing a retrieval-quality problem, given that structure is supposed to beat retrieval.
