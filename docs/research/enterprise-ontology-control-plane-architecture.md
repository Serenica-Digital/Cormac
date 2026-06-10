# Enterprise Ontology Control Plane Architecture

> **Status:** reference · **Last reviewed:** 2026-06-09

## Why This Matters

Direct relevance: 8/10. The Snowflake Reddit thread and the linked Snowflake-Labs ontology example describe a pattern very close to Serenica's contract-first thesis: business meaning lives in a governed semantic layer, not scattered across prompts, hard-coded app tables, one-off queries, and model memory. The scale is different. Snowflake's example is enterprise analytics and AI reasoning over a knowledge graph. Serenica is an operational CRM agent for small teams. But the core architecture is valuable: keep physical storage, semantic meaning, generated access surfaces, agent reasoning, and governance as separate layers.

The caution is equally important. A Reddit commenter pushed back that ontology work often becomes overcomplicated and low-value. That is the trap to avoid. Serenica should adopt the control-plane discipline, not the enterprise ceremony.

## Source Thread

Reddit thread: [Native Ontology on Snowflake](https://www.reddit.com/r/snowflake/comments/1tclwjs/native_ontology_on_snowflake/)

The post points to [Snowflake-Labs/ontology-on-snowflake](https://github.com/Snowflake-Labs/ontology-on-snowflake), a public Snowflake-Labs implementation that presents "Ontology on Snowflake" as a Snowflake-native ontology platform. The thread includes three useful signals:

- The claimed problem: AI pilots almost work, but answers are not trusted; business logic becomes brittle or hard-coded; semantics do not scale across domains or schema changes.
- The claimed answer: compile and regenerate semantics so agents are grounded in business concepts rather than raw schema names.
- The skeptical counterpoint: ontology is easy to overbuild, and many agents do not need a heavyweight ontology unless the data estate is large and complex.

For Serenica, the right interpretation is: **small product, enterprise-grade semantic discipline.** The product does not need a huge ontology program. It does need a governed contract layer that can generate safe agent context, validation rules, UI structure, import/export mappings, and audit evidence.

## What The Snowflake Example Builds

The Snowflake-Labs repo describes a five-layer architecture:

1. **Physical storage:** generic knowledge graph tables, `KG_NODE` and `KG_EDGE`.
2. **Ontology metadata:** classes, relationships, properties, permissions, and inference rules.
3. **Generated views:** abstract ontology views generated from metadata, such as person or relationship views.
4. **Semantic models:** specialized semantic models for concrete knowledge-graph queries, abstract ontology reasoning, and metadata/governance introspection.
5. **Agent orchestration:** Cortex Agent and graph analytics tools reason over the semantic models and graph services.

That stack is not an official requirement for Serenica. It is a useful reference architecture for separating physical data, semantic meaning, generated interfaces, and agent behavior.

Sources:

- [Snowflake-Labs ontology repo](https://github.com/Snowflake-Labs/ontology-on-snowflake)
- [Snowflake semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- [Snowflake Cortex Agents](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents)

## The Extracted Pattern

The enterprise ontology control-plane pattern has six parts.

### 1. Physical Data Is Not The Business Model

Raw storage is optimized for durability, access, and performance. It is not the user-facing model of the business. In Snowflake's example, `KG_NODE` and `KG_EDGE` are generic physical tables. In Serenica, `business_records` is a JSONB-backed operational store with generated hot columns.

This is the same move: the database stores durable facts, while the semantic contract explains what those facts mean.

### 2. The Ontology/Contract Is Governed Metadata

The semantic layer is explicit, versioned metadata. It defines object types, relationships, properties, permissions, aliases, and rules. In Serenica terms, that is the published workspace contract:

- objects
- fields
- relationships
- identity rules
- aliases
- Excel mappings
- field sensitivity
- agent-editability
- confirmation/risk policy hooks

This layer is product IP. It should live in our control plane and Supabase/Postgres, not in Hermes memory, Juno configuration, Lovable UI code, or one-off prompts.

### 3. Interfaces Are Generated From Metadata

Snowflake's example generates abstract views from ontology metadata. The equivalent Serenica move is broader:

- generated or configured record screens
- import/export mappings
- Excel draft-sync format
- agent context packs
- validation schemas
- review-queue diffs
- future MCP tools
- possibly SQL views or query helpers

The same contract should feed all surfaces. A field should not mean one thing to the web UI, another to SMS, another to Excel, and another to the agent.

### 4. Agents Reason Over Semantic Interfaces, Not Raw Tables

Snowflake's Cortex Agent uses semantic models and tools. The agent is not supposed to stare at thousands of physical tables and guess business meaning. For Serenica, Hermes should receive a compact, tenant-scoped, contract-derived context:

- active contract version
- object definitions
- relevant records
- allowed fields
- sensitive-field redactions
- identity/matching rules
- examples/corrections
- allowed tools

The agent outputs structured proposals. The control plane validates those proposals before any write.

### 5. Governance Is Queryable

The Snowflake example includes a metadata/governance semantic model so agents and users can ask what object types, permissions, and rules exist. Serenica should eventually support the same kind of introspection:

- What fields can the agent edit?
- Which fields are sensitive?
- Which objects exist in this workspace?
- What is the identity rule for a person or deal?
- Which mappings came from which workbook/table/column?
- Why was this proposal blocked?

This is not a nice-to-have. It is how a contract-first system becomes understandable instead of magical.

### 6. Regeneration Beats Hand Patching

The strongest idea in the thread is that semantics should be compiled/regenerated. If a workbook changes or a contract version changes, downstream artifacts should regenerate from the source contract rather than be hand-patched:

- Zod validators
- display metadata
- agent instructions/context
- Excel mappings
- MCP tool schemas
- import/export templates
- eval cases

That is exactly why the contract must be first-class data. The contract is the source artifact; everything else is derived.

## Mapping To Serenica

| Snowflake ontology layer | Serenica equivalent | Notes |
| --- | --- | --- |
| `KG_NODE` / `KG_EDGE` physical graph storage | `business_records` JSONB store, future relationship edges | Serenica is operational CRM, so records are mutable and audited. |
| Ontology metadata | `schema_contracts`, `schema_objects`, `schema_fields`, relationships, mappings | This is the core product IP. |
| Generated ontology views | Contract-derived UI, validation, import/export schemas, query helpers | We may not need SQL views early; generated product surfaces matter more. |
| Semantic models | Agent context packs, future query models, MCP schemas, eval suites | Purpose-built for web/SMS/Excel/agent behavior. |
| Cortex Agent + graph tools | Hermes runtime behind the control-plane adapter | Runtime reasons; control plane validates and writes. |
| Snowpark Container Services graph service | Juno-hosted service containers, future graph/matching service | Juno is outside the data platform; Snowflake containers run inside Snowflake. |

## What Serenica Should Borrow

- Treat the contract as the semantic control plane.
- Generate downstream artifacts from the contract.
- Separate physical storage from business meaning.
- Give the agent semantic models/tools, not raw database access.
- Make governance and permissions introspectable.
- Add graph/relationship reasoning only when the domain demands it.

## What Serenica Should Not Borrow Yet

- A full enterprise ontology program.
- Generic graph abstraction for everything.
- Complex inference rules before the design partner has real workflow pain.
- Multi-semantic-model architecture before the single contract-driven agent loop works.
- Snowflake as a backend replacement for Supabase/Postgres.

## Design Implications

The current Serenica architecture is pointed in the right direction. The Snowflake ontology thread reinforces these decisions:

- ADR-002, contract-first data model, is the right foundation.
- ADR-019, JSONB-backed hybrid storage, matches the "physical storage is not the ontology" pattern.
- ADR-005, control plane only writer, remains the safety boundary.
- ADR-009, learning as governed data, is the operational version of ontology governance.
- ADR-021, runtime seam validated with a stub, keeps the agent replaceable behind semantic contracts.

The biggest gap is generated surfaces. We have the contract and validation skeleton, but the next major design work is deciding what gets generated from the contract and how those generated artifacts are versioned, tested, and audited.

## Recommended Next Questions

- What is the minimal contract metadata needed to generate useful UI, validation, and agent context for the design partner?
- Should relationships become explicit first-class records/edges in v1, or remain fields/links until real queries require graph traversal?
- What contract-derived artifacts should be materialized and versioned versus generated on demand?
- What does contract introspection look like in the UI?
- Can the Workbook Contract Agent produce not only a contract draft, but also starter eval cases and example utterances?

## Sources

- Reddit discussion: [Native Ontology on Snowflake](https://www.reddit.com/r/snowflake/comments/1tclwjs/native_ontology_on_snowflake/)
- Snowflake-Labs repo: [ontology-on-snowflake](https://github.com/Snowflake-Labs/ontology-on-snowflake)
- Snowflake docs: [Semantic Views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- Snowflake docs: [Cortex Agents](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents)
- Snowflake docs: [Snowflake key concepts and architecture](https://docs.snowflake.com/en/user-guide/intro-key-concepts)
