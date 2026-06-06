# ADR-008: Two agent roles: Workbook Contract Agent and CRM Operations Agent

**Status:** Accepted
**Date:** 2026-06-06
**Related:** Both roles run on ADR-006 (the Hermes runtime) and operate around ADR-002 (the contract). The Workbook Contract Agent is the upload-wizard door of ADR-007 and authors what ADR-002 governs, while the corrections the Operations Agent produces feed the learning loop of ADR-009.

## Context

Two jobs hide inside the phrase "the agent." Turning a client's workbook into a governed contract is not the same work as interpreting a day-to-day update. The first defines the world the system operates in. The second operates inside it. They differ on trust, latency, surface, and stakes, and conflating them into one undifferentiated agent both hides those differences and makes it far too easy to let an external surface or an inbound message reshape a workspace's schema.

The contract-authoring job is also more than parsing, which is the insight from ADR-002. A spreadsheet carries shape but not the semantics the agent needs: identity, disambiguation, per-field write permission, lifecycle, conflict rules. Producing the contract is an elicitation of metadata the sheet does not contain, done with the model's help and then reviewed by a human. Lots of CRMs say "import from Excel." Far fewer say "bring us the spreadsheet your business already runs on and we turn your tables into a governed, agent-ready contract." That second sentence is a different and harder workflow, and it earns its own agent role.

## Decision

The agent is two roles, expressed as skills or flows on the one runtime (ADR-006), both calling back through the control plane (ADR-005).

### 1. Workbook Contract Agent

Given a client workbook, it detects tables, columns, types, sample values, relationships, and candidate identifiers (the mechanical, not-yet-semantic step), then proposes a semantic contract: object types and display fields, field types, identity rules, aliases, relationships and cardinality, Excel mappings, and which fields the agent may write. It is web-only, admin-gated, high-stakes, and async. Nothing it proposes takes effect until an admin reviews and publishes it (ADR-002). It authors the world, and its output is a proposed contract version, never a live schema change.

### 2. CRM Operations Agent

Given the published contract, it extracts entities from an update, matches them to existing records, proposes changes, and answers questions. It is multi-surface and its read path is latency-sensitive, so it runs on the warm interactive lane (ADR-006). It operates strictly inside the world the contract defines, and it never changes the contract. When it cannot confidently match an entity, it flags uncertainty or asks for clarification rather than guessing, which is the routing that the confidence question in ADR-005 and ADR-010 is about.

### 3. The boundary between them is a trust boundary

Authoring is governed, versioned, reviewable, and admin-gated. Operating is per-update and multi-surface. Future workbook changes create contract-change proposals, not silent schema mutations, which is the same principle as ADR-005 applied to schema instead of records: the contract changes only through a governed publish, whoever or whatever originates it.

## Consequences

- Contract change stays safe by construction. Because authoring is its own admin-gated, web-only role, an external surface (the MCP connector) or an inbound message (an SMS) cannot reshape a workspace's schema even in principle. This is why schema authoring is deliberately not an MCP tool (ADR-007).
- The Operations Agent is where the correction loop originates. Rejected and edited proposals and wrong matches become the structured signal that ADR-009 distills into reviewed aliases, rules, and eval cases and folds back through the authoring gate. The two roles thus form a cycle: authoring defines the contract, operating generates corrections, corrections improve the contract.
- Both roles share the runtime and the one pipeline (ADR-007), so this split is about responsibility and trust, not separate infrastructure.

## Alternatives considered

**One agent that does both.** Simpler to describe and to build at first. Rejected because it conflates the trust, latency, and stakes of authoring with those of operating, and it makes it easy to accidentally expose contract authoring as a casual tool reachable from a low-trust surface. Keeping the roles separate is exactly what lets authoring stay admin-gated and web-only while the operations path stays multi-surface and fast.

**Autonomous schema mutation from edited Excel.** Let the system rewrite the contract directly when the workbook changes, so a client editing their sheet re-shapes the model. Rejected because contract change is foundational and must be admin-reviewed and versioned. The agent proposes a contract change; an admin publishes it. This is the schema-level statement of the ADR-005 trust boundary.

## Open items

1. **Detection versus proposal split.** How much of contract authoring is deterministic schema detection versus LLM-proposed semantics, and where the human review sits between them. Leaning toward deterministic detection feeding an LLM proposal that a human edits, which keeps the mechanical part reliable and the judgment part reviewable.
2. **Operations eval cases.** The starter set of eval cases for the Operations Agent (entity matching, ambiguity handling, alias resolution) that should exist before a workspace is allowed to run in apply-then-report mode (ADR-009, ADR-010).
3. **Re-publish ergonomics.** How a contract change interacts with records already stored against an older version, which connects to the versioning model in ADR-002 and the storage representation in ADR-003.
