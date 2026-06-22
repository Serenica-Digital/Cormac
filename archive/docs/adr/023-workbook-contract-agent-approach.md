# ADR-023: The Workbook Contract Agent is the keystone; approach committed, feasibility deferred to a spike

**Status:** Accepted as approach; the feasibility GO/NO-GO is deferred to a spike, mirroring how ADR-006 deferred to the spike that became ADR-021
**Date:** 2026-06-09
**Related:** Refines ADR-008 (the Workbook Contract Agent role) with a sharper account of what the agent must and must not be good at. It depends on ADR-002 (the contract as the semantic layer, and the Anthropic finding it cites), emits the Zod-validated contract of ADR-018 rather than SQL because there are no per-client tables (ADR-019), draws its evals from ADR-009, keeps the human-in-the-loop publish gate of ADR-008 and ADR-002, and feeds the live Excel surface of ADR-022. The spike is deliberately independent of the Excel-sync model (ADR-022) and the Microsoft connector (ADR-012).

## Context

The Workbook Contract Agent (ADR-008) is the product's keystone. It turns a client's workbook into the governed contract every other part of the system reads, and it is the central build risk. The natural fear is that this agent must be a unicorn: deep Excel expertise, deep SQL and Postgres expertise, and the interview skill to extract a coherent model from a manager. Examined against decisions already made, two of those three requirements are largely abstracted away, which narrows the real difficulty to one thing and makes the keystone tractable rather than mythical. This ADR records that reframe and commits the approach, while leaving the feasibility verdict to a spike, because the agent's quality is an empirical question and the project records agent GO/NO-GO calls against evidence (ADR-006, ADR-021), not against optimism.

## Decision

### 1. The agent outputs a contract document, not SQL

There are no per-client tables to design (ADR-019). The agent never writes DDL, never designs storage, and never touches Postgres. Its output is the contract meta-schema, validated by Zod at the boundary (ADR-018, ADR-002). Deep SQL and Postgres skill is therefore not a requirement of this agent at all. The bridge to storage is already built, generic, and done, and the JSONB store absorbs whatever the contract says.

### 2. Reading the workbook is mostly mechanical detection

Profiling a workbook (tables, columns, types, sample values, candidate identity columns, formula columns) is largely code: a parser plus a column profiler. The agent reasons over that structured profile, not over raw Excel internals. Real judgment remains for irregular layouts (multiple tables on one sheet, headers not in the first row, merged cells creating phantom structure), but the bulk is deterministic, which is the detection-feeds-proposal split ADR-008 open item 1 already leaned toward. Deep Excel-internals expertise is therefore not the load-bearing skill either.

### 3. The hard, irreducible job is elicitation and synthesis

The meaning is not in the columns (ADR-002). The Anthropic work it cites is the warning: when the model auto-generated semantic definitions, it "encoded the very ambiguities we were trying to eliminate." So the agent cannot divine the contract from the data. Its craft is to locate the ambiguities (is this column a person or a company, is "status" a lifecycle or a flag, are these two columns one entity, is this a relationship), ask a small number of targeted questions, propose sensible defaults, and synthesize one coherent object model: objects, fields, identity rules, relationships and cardinality, aliases, and which fields the agent may write. The human owns the result through the publish gate.

### 4. It is buildable with current models, under four conditions

This is a structured-extraction-plus-interview task, which current frontier models do well. The approach commits to four conditions that make it an engineering discipline rather than a demo:

- **Bounded output.** The contract meta-schema constrains what the agent can emit, so it cannot produce something that does not parse. It fills a validated structure rather than generating freely.
- **Human in the loop.** The agent has to produce a good first draft and good questions, not a perfect contract. The manager edits and approves; the publish gate is governed (ADR-008, ADR-002).
- **Developer-assisted v1.** A developer co-pilots the first clients while the agent matures (ADR-002 open item 3), so the agent does not need full autonomy on day one.
- **An eval set.** Real workbooks paired with known-good contracts, scored, so quality is measurable and regressions are caught (ADR-009). Authoring evals join the operations evals ADR-009 already calls for.

### 5. The central risk is the plausible-but-wrong contract

This is the authoring analog of the silent-write problem (ADR-005). A subtly wrong identity rule or relationship that a manager rubber-stamps because it looks reasonable poisons the whole CRM at its foundation. The mitigations are targeted: heavier human review on the high-stakes calls (identity, relationships, agent-write flags), eval coverage aimed specifically at those calls, and developer-assist early. The agent's confidence and the points where it should force a human decision are part of the design, not an afterthought.

### 6. The spike is decoupled from all Excel-sync and Microsoft infrastructure

Authoring needs only an uploaded file (Level 0). It needs no Graph, no connector, no add-in, and no consent. So the scariest and most important piece of the product has the lowest infrastructure dependency of anything major. The spike feeds the design partner's real workbook through the flow, even half by hand at first, and measures two things: how close the proposed contract gets, and how the interview actually feels. That converts the keystone from belief to evidence before heavy build, exactly as ADR-006's spike became ADR-021.

## Consequences

- The keystone risk is real but focused. It is not raw model capability. It is interview quality, coherence across a messy multi-sheet workbook, and avoiding the plausible-but-wrong contract. Those are UX, prompt, and eval problems, which are the kind a small team can actually grind down.
- The spike is the cheapest high-value experiment in the whole product and has the lowest infrastructure dependency, so it should jump the queue ahead of the Excel-sync and connector work it does not depend on.
- Evals become a first-class deliverable for authoring, not only for operations. ADR-009's eval discipline extends to workbook-to-contract pairs.

## Alternatives considered

**Treat the agent as needing deep Excel and SQL expertise.** The intuitive framing. Rejected as a mis-scope: the architecture abstracts both away (no per-client SQL, mechanical detection), and framing the agent as a unicorn overstates the difficulty and misdirects effort away from the part that is actually hard.

**Fully autonomous authoring with no human review.** Rejected because it contradicts ADR-002 and ADR-008, and because the plausible-but-wrong risk makes human ownership of the high-stakes calls mandatory. The agent proposes; a human publishes.

**Skip the agent and configure every contract by hand.** Developer-assist is the v1 bridge, but hand-configuration as the permanent model is rejected: it does not scale past the first few clients and it abandons the distinctive workflow that is the product's IP.

**Write a feasibility ADR now that declares the agent proven.** Rejected as premature and against the project's evidence-before-ADR culture. Like ADR-006, the approach is committed here and the GO/NO-GO belongs to the spike.

## Open items

1. **The spike result.** How close the proposed contract gets on a real workbook, the interview length and feel, and where it breaks. This becomes its own status update, the way ADR-021 reported back on ADR-006.
2. **Question strategy.** How the agent decides what is worth asking, and how to cap interview length without losing coherence.
3. **Identity and relationship inference.** The subtle calls (ADR-002 open item 2), and how much human review each high-stakes call needs.
4. **The authoring eval set.** The starter corpus of workbook-to-contract pairs and the scoring method (ADR-009).
