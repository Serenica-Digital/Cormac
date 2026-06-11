# Workspace Knowledge Layer: Design Research

> **Status:** reference · **Last reviewed:** 2026-06-11

## Why This Matters

Direct relevance: 10/10. This is design research for the product's own context architecture, commissioned after the observation that the agent's per-task world is thin: a 36-line generic SOUL.md, a tool-fetched contract, and a naive record search. The question: what is the production-proven way to structure per-tenant knowledge for an LLM agent under our constraints (control plane is the only writer, runtime stateless with memory off, all learning as governed data), and what should we adopt.

Method: a multi-agent deep-research pass (20 sources fetched, 98 claims extracted, 25 adversarially verified by independent three-vote panels, 24 confirmed, 1 refuted), plus direct source inspection of our pinned runtime image (`nousresearch/hermes-agent:v2026.6.5`). Claims below carry their verification outcome. Where evidence is vendor-authored or preprint-only, that is flagged.

## Headline

The production-proven pattern for a team in our position is **layered, governed context compiled by the control plane into a stable cached prompt prefix**. Not autonomous runtime memory. Not a knowledge graph. The strongest external evidence in the set independently validates the posture our ADRs already chose (memory off, gated writes, learning as governed data) and then tells us the part we have not built: the contract, glossary, learned knowledge, and per-tenant skills belong in a byte-stable, cache-priced system-prompt prefix that the control plane compiles per workspace, with progressive disclosure for anything large.

## Finding 1: Memory-off is now externally evidenced, not just our preference

A June 2026 systematic study of memory-poisoning attacks (arXiv 2606.04329, verified 3-0) measured the Hermes agent at a **66.67% average attack success rate across six attack classes** with persistent memory enabled, versus 34.25% for the comparison agent, and traced the gap to Hermes's memory architecture: an aggressive system-prompt-driven write policy, a low compaction threshold, and persistent memory injected into the system prompt as a frozen snapshot at session start. Our own inspection of the pinned image corroborates that last mechanism directly: `agent/system_prompt.py` injects the memory snapshot into the system prompt's volatile tier when memory is on.

Microsoft's AI Red Team whitepaper (verified 3-0) reports the same failure shape on a different stack: a poisoning attack succeeded in 40% of baseline trials and **over 80% once the agent was prompted to consult its memory**. Their recommended mitigation is "authenticated memorization": external validation for all memory updates through a trusted layer. That is a third-party description of our propose-then-review learning design (ADR-009, issue #35).

The highest-success attack class in the poisoning study targets **auto-compaction** (85.17% ASR): automatic summarization of untrusted content into durable context. A separate preprint on semantic drift (arXiv 2603.11768, verified 3-0 for the mechanism only) adds the integrity argument: iterative summarization strips nuance and compounds errors persistently. Both point the same way: any pipeline that distills episodic history into durable knowledge must treat its input as adversarial and route through human review. Never auto-compact tenant data into context.

Caveats: the poisoning study is a non-peer-reviewed preprint evaluated on GPT-OSS-120B, not Claude; one verifier of three questioned whether its "HERMES" is our upstream (the other verifiers, and our own source inspection of the frozen-snapshot mechanism, support the identification). Re-confirm before citing in the security packet. A claim from the drift paper endorsing write-validation gates was refuted 0-3; the gate endorsement rests on the Microsoft whitepaper alone, whose case study is directionally strong but statistically thin.

**Application: ADR-009 and the memory-off posture hold, now with citable third-party evidence. The governed learning loop (#35) is the industry-recommended mitigation, not a conservative compromise. Promote it from P2.**

## Finding 2: Graphs do not pay off at our scale; an edges table does

The honest verdict on GraphRAG and dedicated graph databases, from sources including Microsoft's own publications (all verified 3-0 or 2-1):

- On simple fact retrieval, the dominant CRM query shape, plain chunk RAG with reranking beat MS-GraphRAG 60.92% to 49.29% (GraphRAG-Bench, ICLR 2026). GraphRAG "frequently underperforms vanilla RAG on many real-world tasks."
- GraphRAG's measurable wins are confined to complex multi-hop reasoning and corpus-level summarization, with deltas as modest as +3.34 points even there.
- Prompt-token overhead is severe: MS-GraphRAG global queries expand prompts from 7,800 to ~40,000 tokens.
- Microsoft's own measured query latency was 20-24 seconds end to end. That is worse than our entire 15.5-18.4s per-run baseline before the agent does anything. (Single informal 2024 measurement predating LazyGraphRAG; no source shows current latency under ~15s.)
- Cost is not the blocker at our scale; graph construction on a tenant corpus would be cents. Latency, token overhead, and task mismatch are the disqualifiers.

Temporal knowledge-graph memory (Zep/Graphiti), the main production precedent, does not clear the bar either: on DMR the vendor's own paper shows 94.8% versus 94.4% for a plain full-context baseline, and its headline LongMemEval gains are self-reported, "up to" phrased, and methodologically contested (verified 3-0, cited deflationarily).

**Application: relationships stay as a typed edges table over the JSONB store (issue #20 resolves toward the simple shape). No graph database, no GraphRAG. Revisit only if cross-record multi-hop analytical questions become a real workload, which is the one task family where graphs verifiably win.**

## Finding 3: The contract belongs in the cached prefix, not behind a tool call

Anthropic prompt-caching mechanics (verified 3-0 against live docs, fetched 2026-06-11):

- Cache reads bill at 0.1x base input price. 5-minute cache writes at 1.25x, 1-hour writes at 2x.
- Prefixes build in fixed order tools → system → messages; a change at any level invalidates that level and everything after.
- Sonnet 4.6's minimum cacheable prefix is 1,024 tokens. Our current 36-line system prompt likely misses it on its own; a contract-bearing prefix clears it.
- The 5-minute cache refreshes free on every use, so any workspace with sub-5-minute cadence pays read prices after the first write.

Today the agent burns a model round trip calling `get_active_contract` every run, and the contract lands mid-conversation as a tool result: re-tokenized per run, cache-hostile, and one of the 4-6 model calls in the 15-18s loop. Moving the compiled workspace context into the system prompt makes it byte-stable between contract publishes and cache-read priced across runs. Directional arithmetic (not a measurement): removing the contract round trip cuts 1-2 model calls, roughly 3-6 seconds (20-35% of run latency), with cost holding near or below the $0.04 baseline.

### The harness side, verified in source (pinned image v2026.6.5)

This answers "are we using Hermes properly for caching": partially not, and the gap is ours, not upstream's.

- Hermes applies a deliberate caching strategy, `system_and_3` (`agent/prompt_caching.py`): up to 4 `cache_control` breakpoints, one on the system prompt and three on the last three messages, default 5m TTL, configurable to 1h via `prompt_caching.cache_ttl`.
- The system prompt is assembled cache-first in three tiers (`agent/system_prompt.py`): stable (SOUL.md, tool guidance, skills) → context (a caller-supplied `system_message` plus context files) → volatile. The timestamp line is deliberately date-only so the prompt stays byte-stable for a full day (upstream PR #20451, explicitly for prefix-cache preservation). Built once per session, never rebuilt mid-session.
- The **context tier is our injection seam**: the runtime accepts a caller-supplied `system_message`, which is exactly where the control plane's compiled workspace context should enter. The harness was designed for a rich stable prefix with the loop on top; we have been running it with a generic 36-line identity and making it fetch its world through tools.

Empirical checks before committing the design (an afternoon of work): confirm the adapter does not enable `pass_session_id` (a session ID line in the prompt breaks cross-run cache identity); confirm the Runs API threads `system_message` into the context tier; confirm tool definitions serialize byte-stably across runs; and instrument `cache_read_input_tokens` / `cache_creation_input_tokens` on real runs, since a below-minimum or broken prefix fails silently with no error.

Economics to measure at the pilot: per-workspace run cadence versus the 5-minute TTL decides between 5m writes (1.25x), 1h writes (2x), or accepting re-writes for sparse tenants. Pricing, TTLs, and per-model minimums are time-sensitive vendor documentation; re-verify on any model change.

## Finding 4: Per-tenant procedural knowledge follows the Agent Skills pattern

Anthropic's Agent Skills design (verified 3-0, first-party): a skill preloads only its name and description into the system prompt (~30-50 tokens per skill), with the full body read into context on demand and bundled references as a third level. Progressive disclosure is the core principle.

The mapping for us (synthesis, not itself a verified claim): per-tenant skills and reference docs live as versioned, reviewed rows in Postgres; the control plane compiles them at task start into stubs in the cached prefix, with bodies fetched just in time. The governed source of truth stays in the database; runtime artifacts are derived and regenerated per publish. This is the same compile-from-contract discipline the ontology research already recommended, extended to procedure. It also matches the skill taxonomy the Anthropic analytics application note proposed (SMS interpretation, email extraction, question answering, weekly report), which was never built.

## The recommended architecture: five strata, one gate

All strata are governed data in Postgres, all compiled by the control plane, none writable by the runtime. Composition is our synthesis; each component rests on a verified finding above.

| Stratum | Content | Populated by | Enters context as |
| --- | --- | --- | --- |
| 1. Schema contract | objects, fields, identity, trust flags (exists today) | authoring flow, publish gate | compiled into the cached prefix, no longer tool-fetched |
| 2. Business glossary | canonical definitions, process notes, segment context; meaning that is not field-shaped | the authoring interview and corrections, publish gate | prefix, after the contract |
| 3. Learned knowledge | aliases, disambiguation precedents, correction-derived rules | propose_learning gate with human review (#35) | prefix (compact, typed) |
| 4. Procedural skills | per-tenant versioned skill docs (SMS style, report format, house rules) | authored and reviewed, versioned | stubs in prefix, bodies on demand |
| 5. Episodic history | source messages, audit events, immutable | already exists | retrieved per task, never auto-distilled without review |

Prefix layout, most-stable-first per the invalidation hierarchy: shared tool definitions → shared agent identity (SOUL) → per-workspace compiled context (strata 1-4) at the final breakpoint. Recompile on publish; a publish is a deliberate cache invalidation, which is correct.

## Traps the sources call out

- **Auto-compaction of untrusted input into durable context.** Highest-ASR attack class and the main drift mechanism. Every distillation step goes through review.
- **Letting the prefix grow unboundedly.** Progressive disclosure exists because preloading everything re-creates prompt bloat at 1x write cost; stubs plus on-demand bodies is the scaling shape.
- **Graph ceremony.** The ontology research's warning, now quantified: the latency and token overhead land before any benefit at our entity counts.
- **Vendor benchmarks.** Zep's numbers are self-authored and contested; GraphRAG latency figures are informal. Treat both as directional.
- **Silent cache failure.** Below-minimum prefixes and unstable serialization return no error. Only the usage fields prove hits.

## Evidence gaps

- No claims from the general context-engineering practitioner sources (the Anthropic context-engineering post, Karpathy, Mollick, Willison, Weng) survived adversarial verification; the prefix-versus-tool-fetch recommendation rests on verified caching mechanics, the Skills pattern, and our measured baseline, not a published production A/B.
- The poisoning ASRs were measured on a different model family; directionally corroborated across three independent source families, absolute rates not transferable.
- The cost/latency estimate is arithmetic from verified pricing, to be replaced by Phase-4-style measurements on our stack.

## What this changes for the build

1. An ADR for the workspace knowledge layer: the five strata, the one publish gate, the compiled-prefix context assembly. Extends ADR-002/009; refines the ADR-025 posture (the contract moves from tool-fetch to prefix; `get_active_contract` stays for mid-run re-reads but stops being the primary delivery).
2. The harness verification checklist above, run as a short spike on the live stack, with cache usage fields as the evidence.
3. Reprioritization: #35 (governed learning) and #36 (retrieval) rise; #20 settles toward the edges table; the authoring agent (#17) becomes the population mechanism for strata 1-2, which strengthens the case that the interview machinery (ask-user tool, control-plane-held state, #37) is general context-elicitation infrastructure, not a workbook-only feature.

## Sources

Verified primary sources: [arXiv 2606.04329](https://arxiv.org/html/2606.04329) (memory poisoning, preprint), [Microsoft AI Red Team whitepaper](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/final/en-us/microsoft-brand/documents/Taxonomy-of-Failure-Mode-in-Agentic-AI-Systems-Whitepaper.pdf), [arXiv 2603.11768](https://arxiv.org/pdf/2603.11768) (semantic drift, preprint), [Zep paper arXiv 2501.13956](https://arxiv.org/abs/2501.13956) (vendor-authored), [GraphRAG-Bench arXiv 2506.05690](https://arxiv.org/pdf/2506.05690), [Microsoft GraphRAG costs](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/graphrag-costs-explained-what-you-need-to-know/4207978), [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [Anthropic Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), [Agent Skills docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview), [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

Local verification: source inspection of `nousresearch/hermes-agent:v2026.6.5` (`agent/prompt_caching.py`, `agent/system_prompt.py`, `agent/prompt_builder.py`, `hermes_cli/config.py`).
