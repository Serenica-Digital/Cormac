# ADR-027: The workspace knowledge layer: governed strata, compiled into a cached prefix

**Status:** Accepted
**Date:** 2026-06-11
**Related:** Extends ADR-002 (the contract carries semantics) and ADR-009 (learning as governed data) into a full information architecture. Refines ADR-025's context delivery: the contract moves from tool-fetched to a compiled system-prompt prefix, with the tool retained for mid-run re-reads. Applies ADR-010's confirmation-mode pattern to learning. Strengthens, and does not loosen, ADR-005 (the control plane is the only writer) and the memory-off posture of ADR-006/ADR-009. Settles the relationship question of the ontology research toward an edges table. The evidence base is [docs/research/workspace-knowledge-layer-design.md](../research/workspace-knowledge-layer-design.md) (adversarially verified external research plus source inspection of the pinned runtime image), the workbook spike ([docs/research/workbook-contract-agent-spike.md](../research/workbook-contract-agent-spike.md)), and the Anthropic application note ([docs/research/anthropic-self-service-analytics-and-skills.md](../research/anthropic-self-service-analytics-and-skills.md)). Shapes the authoring agent build (#17), multi-turn state (#37), the learning loop (#35), and retrieval (#36).

## Context

The operations agent's per-task world is thin: a 36-line generic identity prompt, a tool-fetched schema contract, and a naive substring search. The contract as built is a data dictionary with permission flags. It answers what shape the data is and what the agent may touch; it cannot hold what anything means to the business. The workbook spike made the gap concrete: the authoring agent's reasoning surfaced rich business understanding (a status hidden in a company name, a pipeline tracked only in notes), and the meta-schema had nowhere to put any of it that was not field-shaped.

The thinness was a triage failure, not a research failure. The ontology research and the Anthropic application note had both already described the missing layer (context packs, per-workspace skills and reference docs, correction logs, queryable governance), and their conclusions were filed as reference instead of becoming work. The deliberately conservative posture (memory off, gated writes) was correct; the strata that posture makes safe were never built.

The design research (June 2026) closed the remaining questions with verified evidence:

- **Memory-off is externally evidenced.** A systematic memory-poisoning study measured the upstream runtime at a 66.67% average attack success rate with persistent memory enabled, and Microsoft's red team found that prompting an agent to consult its memory roughly doubled attack success. Microsoft's recommended mitigation, externally validated memory writes through a trusted layer, is this project's existing design. Authentication does not close this surface: inbound email and SMS carry content authored by third parties, and the failure mode is silent and compounding.
- **Auto-compaction is the most dangerous mechanism.** The highest-success attack class targets automatic summarization of untrusted content into durable context (85% ASR), and the same mechanism is the primary driver of semantic drift. Distillation into durable knowledge must pass review.
- **Graphs lose at our scale.** Plain retrieval with reranking beat GraphRAG 61% to 49% on fact lookup, and GraphRAG's measured query latency alone exceeds the entire per-run baseline. Cost is not the blocker; latency, token overhead, and task mismatch are.
- **The caching gap is ours, not the runtime's.** The pinned image applies a deliberate cache strategy (breakpoints on the system prompt and recent messages), assembles its system prompt cache-first with a date-only timestamp, and accepts a caller-supplied `system_message` in the cacheable context tier. The product runs it with a generic identity and makes it fetch its world through tools every run, paying a model round-trip and fresh-token prices for content that is byte-stable between publishes.

## Decision

A workspace's governed definition grows from a schema contract into a **workspace knowledge layer**: five strata, all data in Postgres, all written only by the control plane, compiled per workspace into a cached prompt prefix. Runtime memory stays off.

### 1. The five strata

| Stratum | Content | Populated by | Reaches the agent as |
| --- | --- | --- | --- |
| 1. Schema contract | objects, fields, identity, trust flags (exists) | authoring interview, publish gate | compiled into the cached prefix |
| 2. Business glossary | canonical definitions, process notes, segment context; meaning that is not field-shaped | authoring interview and reviewed corrections, publish gate | prefix, after the contract |
| 3. Learned knowledge | aliases, disambiguation precedents, correction-derived values; typed slots only | the learning gate, per the workspace confirmation mode (section 4) | prefix (compact, typed) |
| 4. Procedural skills | per-tenant skill documents, progressive disclosure | deferred (section 6) | stubs in prefix, bodies on demand |
| 5. Episodic history | source messages, audit events, immutable (exists) | already built | retrieved per task; never auto-distilled |

**v1 cut (decided):** strata 1 through 3 plus the prefix compilation. The skills stratum is deferred (its early content overlaps the glossary at pilot scale), and episodic retrieval stays at what exists. Relationships stay a typed edges table over the JSONB store; no graph database and no GraphRAG, revisited only if cross-record multi-hop questions become a real workload, the one task family where graphs verifiably win.

### 2. One knowledge artifact, one gate (decided)

The contract meta-schema grows to contain the glossary. One publish gate, one version number, one audit trail, one prefix recompile per publish. "The contract" stays one word and now means the whole governed definition: schema plus meaning. Typed learning rows (stratum 3) version independently as rows because they are high-volume, but they are workspace data under the same authority, and the compiled prefix snapshots them at assembly time. Publishing is a deliberate cache invalidation, which is correct behavior.

### 3. Context assembly: the compiled prefix

The control plane compiles each workspace's context (active contract, glossary, applicable learned knowledge) and delivers it through the runtime's caller-supplied `system_message`, which lands in the cacheable context tier of the system prompt. Layout follows the cache invalidation hierarchy, most-stable-first: shared tool definitions, shared agent identity, then the per-workspace compiled context at the final breakpoint. `get_active_contract` survives as a tool for mid-run re-reads but stops being the primary delivery.

Expected effect, directional until measured: one to two fewer model calls per run (the contract round-trip disappears), roughly 3 to 6 seconds off the 15.5-to-18.4s baseline, with the workspace context billed at cache-read prices across runs instead of being re-tokenized per run. The empirical gate before this ships: verify the adapter does not enable `pass_session_id` (a session ID line breaks cross-run cache identity), verify tool definitions serialize byte-stably, verify the Runs API threads `system_message` into the context tier, and instrument `cache_read_input_tokens` and `cache_creation_input_tokens` on live runs, because a broken prefix fails silently.

### 4. Learning follows the confirmation mode (decided)

The learning loop reuses ADR-010's policy shape instead of inventing a second review ceremony:

- **Typed slots are the only autonomous lane.** The agent proposes values into narrow, schema-constrained slot types (alias to record, enum synonym, disambiguation precedent), each carrying provenance to the task and correction that produced it. It cannot write free-text rules or prose lessons. A slot value does not generalize, so the overfitting failure of free-text agent memory (accumulated overly-specific rules, over-relied on, unremovable) is excluded structurally: every learned item is an individual row, listable in the weekly report, revocable one at a time.
- **Application follows the workspace confirmation mode.** In apply-then-report workspaces, typed learning auto-applies, is audited, and appears in the weekly report with per-item revocation. In confirm-each workspaces, learned items are confirmed like writes. No separate learning mode; one policy concept per workspace.
- **Structure-shaped learning takes the publish gate.** Anything contract-shaped (a new identity rule, a glossary change, a relationship) routes to admin review regardless of mode, exactly as high-risk writes always require confirmation.
- **No auto-compaction, ever.** No pipeline automatically summarizes episodic history or inbound content into durable context. Distillation is proposed, reviewed, and versioned. This is a permanent constraint, carried from the poisoning and drift evidence.

Roles, using the vocabulary already enforced in `packages/shared`: the publish gate is the `publish_contract` capability (`owner`, `agent_admin`). Revoking a learned item from the weekly report is `manager` and up, the same trust level as approving a proposal. No new capability until evidence shows the split is wrong.

### 5. The authoring interview populates the layer

The Workbook Contract Agent's interview is the population mechanism for strata 1 and 2, and that changes its posture from the earlier batched-rounds idea:

- **Consultative, not a form.** The friction budget belongs to daily capture, not onboarding. The interview is a real working session: free-form, multi-turn, agent-led, with fixed checkpoints (structural decisions explicitly agreed, then draft, then review) rather than fixed rounds. Convergence discipline replaces a question cap: past the structural agreements, remaining uncertainty becomes flagged defaults in the draft, not more questions.
- **The contract may exceed the workbook.** The agent proposes the model it believes the user holds (one Contacts object behind three same-shaped sheets, a real Deals object behind free-text notes), and the user's reward for agreeing arrives as the generated, contract-constrained workbook (ADR-022, #29). The messy original is digested once and retired; there is no resubmission loop.
- **Plain language is enforced, not hoped for.** The conversation layer carries no technical vocabulary; the precision lives in the `propose_contract` tool schema the user never sees. The authoring skill requires questions asked through the user's own data and column names. The eval harness gains a register dimension: a hard lint over generated questions against a banned-vocabulary list, plus a judged would-a-spreadsheet-user-understand-this rubric, scored alongside the existing quality dimensions. The same lint applies to proposal diffs and the weekly report.
- Non-schema knowledge surfaced by the interview (process notes, segment context, vocabulary) lands in the glossary stratum instead of being discarded, which is the reason the glossary ships in v1 with the authoring agent rather than after it.

### 6. Deferred, with triggers

- **The skills stratum** (per-tenant procedural documents with progressive disclosure: stubs in the prefix, bodies on demand). Trigger: glossary entries start carrying procedure rather than meaning, or the prefix grows past comfortable size.
- **Queryable governance introspection** (what may the agent edit, why was this blocked). Trigger: pilot users actually asking these questions.
- **Expanded episodic retrieval** beyond current tools. Trigger: eval evidence that retrieved history changes proposal quality.

## Consequences

- The meta-schema in `packages/contract` grows glossary structures; migrations add the learning tables; the adapter grows prefix compilation and the `system_message` path; the runtime profile stays as-is except for verified cache settings.
- The board moves: #35 (learning loop) and #36 (retrieval) rise from P2, #20 settles toward the edges table, #17 is built against this design with #37 (multi-turn state) as its dependency, and the cache verification spike is new work.
- The security packet gains: third-party evidence for the memory-off control, the learning gate as an enforced control with the no-auto-compaction constraint, and the register/control rows that go with them.
- The eval harness gains the plain-language register dimension and, before any workspace enables auto-applied learning under apply-then-report, alias and precedent quality cases (the same eval gate ADR-010 already places on the mode itself).
- Cost and latency claims in this ADR are directional arithmetic from verified pricing. They are replaced by measurements in the cache spike, Phase-4 style, before being cited anywhere client-facing.

## Alternatives considered

**Enable the runtime's persistent memory.** Rejected on the poisoning evidence (66.67% ASR against this specific runtime's memory architecture) and on auditability: opaque memory cannot be inspected, versioned, or excised row by row, and it would break the learning-as-governed-data invariant for no capability the strata do not provide.

**A knowledge graph or GraphRAG layer.** Rejected at this scale on verified evidence: worse than plain retrieval on the dominant query shape, an order-of-magnitude token overhead, and query latency at or above the entire current run budget. The edges table preserves the relationship semantics the domain needs.

**Independent versioning per stratum.** Rejected for v1: three version axes multiply audit, prefix-compilation, and packet bookkeeping for review granularity the pilot does not need. Revisit if glossary churn outpaces contract churn enough to make joint publishes painful.

**Auto-apply learning everywhere from day one.** Rejected: it forks learning policy from write policy and gets ahead of the trust story for confirm-each workspaces. Following the confirmation mode keeps one policy concept and lets the cautious stay cautious.

**Free-text agent memory with a review gate.** Rejected as the autonomous lane: review per free-text item reintroduces the friction the product exists to remove, and unreviewed free text is the overfitting and poisoning quadrant. Free text lives in the glossary and (later) skills, where volume is low and review is cheap.

## Open items

1. **The cache spike.** The section 3 verification checklist, run on the live stack, with usage-field evidence and measured cost/latency against the ADR-026 baseline. Includes the 5-minute versus 1-hour TTL decision, which depends on real per-workspace cadence at the design partner.
2. **Prefix size discipline.** What the compiled context weighs for a real contract plus glossary plus learning, and the budget at which the skills stratum's progressive disclosure stops being deferred.
3. **Learned-item lifecycle.** Usage stats, staleness, and whether unused or contradicted items decay to provisional or surface for review.
4. **Weekly-report learning UX.** How learned items render for one-tap revocation, and how revocation feeds the eval corpus.
5. **The interview's glossary judgment.** What the authoring agent records as glossary versus discards; needs eval coverage so the glossary does not silt up with noise.
