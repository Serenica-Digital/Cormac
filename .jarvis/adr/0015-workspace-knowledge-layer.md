# 0015 — The workspace knowledge layer: the CRM is the agent's memory

- **Status:** Proposed (2026-07-13; spike evidence on PR #117)
- **Builds on:** the memory-off invariant (`requirements.md`; red-team evidence in
  `.jarvis/research/agent-system-round-2026-07.md`), ADR-0001 (the `instructions`
  seam), ADR-0005 (agent capabilities), ADR-0008 (typed tools)
- **Extends, does not relitigate:** memory-off. This ADR is how Cormac remembers
  *without* runtime memory.

## Context

The owner's product requirement: each client's Cormac should remember them — their
people, their shorthand, what was said — and get better over time. The runtime's own
memory is measurably poisonable (Hermes memory-on: 66.7% attack success; consulting
memory doubled attack success in Microsoft's study) and stays off. Both studies'
recommended mitigation is external validation of every memory write through a trusted
layer — which is this product's proposal gate, applied to knowledge. The v0 round
designed exactly this (five strata, one gate) and v2 kept the seams; nothing was built
until the PR #117 spike.

## Decision

Everything Cormac knows about a client is governed data in Postgres, compiled by the
control plane into the byte-stable cached `instructions` prefix, entering only through
review gates. Five strata:

1. **Contract** (exists): published, versioned, in the prefix.
2. **Business glossary** (exists in the contract; elicitation shallow): definitions and
   process notes captured by the authoring interview, publish-gated.
3. **Learned knowledge** (spiked, PR #117): typed slots only — a record-bound `alias`
   (FK cascade) and an `enum_synonym`. The agent may only STAGE a fact
   (`propose_learning`, contract-validated); a human decision (audited) flips it; only
   approved rows compile. No free text, no `precedent` slot, no auto-compaction of any
   inbound content into durable context, ever.
4. **Per-tenant procedural skills** (deferred rung): versioned, reviewed rows compiled
   as stubs with bodies on demand. Agent-authored skill edits, when they come, ride the
   verified staging mechanism (`skills.write_approval` →
   `~/.hermes/pending/skills/` → review in our UI → versioned profile content). Not
   built in this ADR.
5. **Episodic history** (exists) plus **governed recall** (spiked, PR #117):
   `search_history` gives the agent bounded, redaction-safe lookup over past messages
   and replies, so it looks things up instead of remembering.

The privilege shape: `propose_learning` and `read_history` are operations-agent
capabilities (ADR-0005 split); the learning decision rides `approve_proposal`. The
compile stays deterministic: sorted rendering, injection-neutralized values, a learning
decision is a deliberate one-time cache invalidation (measured 86-95% cache across a
publish on the dev lane).

## Consequences

- "Your Cormac knows your book" becomes a security-packet claim, not a liability:
  register row 29 (propose-only learning, Verified) is the packet's "authenticated
  memorization" story.
- The review surface belongs in the Book's panel (approve a learning like a change);
  API-only today.
- Learned volume is bounded by review friction and typed shape; if a workspace's
  approved set ever bloats the prefix, progressive disclosure (stubs + on-demand
  bodies) is the named relief valve, not trimming the gate.
- Metered behavior evidence for the new SOUL steps rides #76 (ADR-0007 lane rules).

## Alternatives considered

- **Hermes runtime memory with `memory.write_approval`:** rejected. Per-profile file
  state on an ephemeral pod, invisible to our audit chain and packet, and the poisoning
  surface remains between approvals.
- **Free-text or `precedent` learning slots:** stays rejected (v0 verdict: free-text
  memory wearing a typed hat).
- **Auto-compaction/summarization of history into context:** rejected; highest-ASR
  attack class (85%) and the drift literature's main failure mode.
- **No learning (status quo):** rejected by the owner's product requirement; the gate
  makes learning compatible with the trust story.
