# ADR-002: Contract-first data model, client spreadsheets define the business objects

**Status:** Accepted (the principle); the physical record-storage representation is deferred to ADR-003 and a prototype
**Date:** 2026-06-06
**Related:** Follows directly from ADR-001 (platform-first). ADR-003 (Supabase as system of record) owns the physical storage question this ADR raises, ADR-004 (Excel as a contract surface) is how a workbook becomes a contract, ADR-008 (Workbook Contract Agent) is the role that authors it, ADR-009 (govern learning as data) folds corrections back into it, and ADR-014 (Lovable for the UI) inherits the generic-UI burden it creates.

## Context

Platform-first (ADR-001) forces a question the bespoke path never had to answer: where do a workspace's business objects come from. The first design partner tracks bankers, facilities, lenders, and deals. A private lender tracks investors, funds, borrowers, loans, and introductions. A different shop tracks something else again. If those become hard-coded product tables, the product is one firm's CRM wearing a platform costume, and generalizing later is the calcification ADR-001 exists to prevent.

The insight that is easy to miss, and that this whole ADR turns on, is that a spreadsheet describes shape, not meaning. A client uploads a table with columns like Name, Company, Status, Last Touch, Amount, Next Step, Notes. That looks usable. It is not enough for an agent to act on safely, because the agent needs to know things the columns do not say:

- Is `Name` a person, a company, a deal, a property, or a shorthand label?
- Is `Status` a lifecycle stage, a task state, a deal-health flag, or an arbitrary note?
- Is `Amount` expected revenue, a loan size, a valuation, a budget, or total project cost?
- When a text says "Dave," which object type is searched first, and what disambiguates two Daves?
- When a row changes, is that a correction, a duplicate, a renamed entity, or a new object?
- Which fields may the agent write without asking, and which require approval?
- Which relationships are one-to-many versus many-to-many, and what counts as a merge conflict?

None of that lives in the columns. It has to be inferred, elicited, and reviewed. This is also the lesson of the Anthropic self-service analytics work (see [docs/research/anthropic-self-service-analytics-and-skills.md](../research/anthropic-self-service-analytics-and-skills.md)): their stack reaches roughly 95% accuracy not from a better model but from a governed semantic layer, one canonical definition per concept consulted first. Two findings from that work bear directly on this decision. Feeding the agent thousands of past queries moved accuracy by under a point, so structure beat retrieval. And when they auto-generated semantic definitions with the model, it "encoded the very ambiguities we were trying to eliminate," so definitions stay human-owned. The contract is our semantic layer, and detection alone is never enough to publish it.

## Decision

A workspace's business objects come from its **published, versioned semantic contract**, not from hard-coded product tables.

### 1. Two categories of data

| Category | Examples | Who defines it |
| --- | --- | --- |
| App-operational | workspaces, users, roles, memberships, source messages, proposals, audit events, integration settings, and the contract itself | The platform. Fixed product structure, typed tables. |
| Client-business | the client's objects and fields (contacts, lenders, deals, facilities, investors, loans, tasks, whatever their world is) | The client's contract, derived from their workbook. |

The platform owns the operational tables. Business objects and fields are contract-driven. The two never blur.

### 2. The contract carries semantics, not just shape

A published contract defines, per object and field: object types and display fields; field names, internal IDs, and types (text, date, currency, enum, phone, email, relationship); identity rules (what makes two records the same record); aliases and synonyms; relationships and their cardinality; Excel column mappings (ADR-004); validation rules; and per-field flags for AI-editable versus human-only and app-managed versus human-editable. The per-field write flags are what let the confirmation model run risk-tiered later (ADR-010).

### 3. Stable identity and versioning

Every object and field has a stable internal ID, independent of Excel labels or row and column positions, so a renamed column is a label change rather than a new field. Records are stored against the active contract version, and every proposal and audit event references the contract version that governed it. The contract lifecycle is explicit: raw workbook, detected schema, draft contract, published contract, contract version. Each later state is more governed than the last (this is the lifecycle drawn in [contract-model.md](../prd/contract-model.md)).

### 4. One gate for contract change

A contract changes only through an admin-reviewed, versioned publish, whether the change originates from a new workbook or from distilled corrections (ADR-009). A detected schema is never published as-is. The semantic layer is added and reviewed first, by the Workbook Contract Agent proposing and a human approving (ADR-008).

## The hard part: how contract-defined records are physically stored

This is the single most consequential technical choice in the product, and it is not honestly settled. The three candidates:

- **Per-object physical tables, generated from the contract.** Best querying, indexing, foreign keys, constraints, and RLS, because each object is a real Postgres table. The cost is that publishing or changing a contract runs DDL (create and alter table) at runtime, per tenant, which makes contract changes a migration-safety problem and complicates rollback and multi-tenant operations.
- **A single generic `business_records` store with values in JSONB.** Contract changes are pure data writes with no DDL, which is operationally simple and makes versioning trivial. The cost is weaker native querying and indexing (mitigated by Postgres GIN indexes and generated columns), constraints enforced in application code rather than the database, and RLS that operates on a `workspace_id` column rather than per-object grain.
- **Hybrid.** A generic JSONB-backed store for the long tail of contract fields, with hot or heavily-queried fields promoted to typed columns (or to typed per-object tables) as access patterns emerge.

**Leaning, to be confirmed by a prototype:** start with the JSONB-backed generic store for v1, validated against the active contract with Zod at the control-plane boundary (ADR-005), because zero-DDL contract changes match a product whose whole premise is that each client defines and evolves their own schema, and because it keeps the contract a piece of data rather than a migration. Promote to typed columns or per-object tables for specific objects once real query and reporting patterns justify the operational cost. This decision is consequential enough that it gets re-opened and recorded as its own ADR the moment the prototype produces evidence, rather than being treated as closed here.

## Consequences

### Architectural

- This is the product's central IP and its central build risk. A contract-first product cannot ship bespoke screens for Deals or People. It needs a generic, metadata-driven UI generated from the contract: table views, record detail, relationship panels, an activity timeline, filters, and forms. That is closer to a small Airtable or Notion than a CRM, and ADR-014 flags it as the shakiest fit for the chosen UI tooling.
- The contract and record values are runtime data validated against a meta-contract, not compile-time TypeScript generated per client. Zod validates the meta-contract shapes (`SemanticContract`, `SchemaObject`, `SchemaField`, `RecordPatch`, `ProposalBatch`) and the structured payloads; the client schema itself lives as rows in Supabase (ADR-003).
- Whatever storage representation wins, RLS and tenant isolation must hold over it, which is a hard requirement on the storage choice, not an afterthought (ADR-003, ADR-015).

### Product

- The learning loop is governed contract data: corrections become reviewed aliases, rules, and eval cases folded back in through the same publish gate (ADR-009). Every lesson is an inspectable, versioned artifact, which is also the compliance story (ADR-015).

## Alternatives considered

**Fixed CRM schema plus custom fields.** Ship typed product tables (People, Organizations, Deals, Tasks) and let clients add custom fields on top. Familiar, fast, and what most CRMs do. Rejected because it hard-codes one model's assumptions about what a business object is. Every client whose world is not People-and-Deals fights the schema, the agent reasons against the wrong primitives, and "custom fields" become a second-class bag bolted onto a shape that was never theirs. It is the bespoke-first calcification of ADR-001 in a thin disguise.

**Generic key-value or JSONB blobs for everything, including the operational tables.** Make the entire database schemaless so any structure fits. Rejected because it destroys the operational layer too: workspaces, roles, audit, and proposals are universal product concepts that benefit from real types, constraints, and foreign keys. The accepted shape is deliberately hybrid at the category level, typed tables for app-operational data and a contract-driven representation for business data, which is a different claim from "JSONB everywhere."

**Let an uploaded workbook reshape the database directly.** Treat the spreadsheet as live schema, so editing the sheet edits the model. Rejected because it makes every cell a potential unreviewed schema mutation with no versioning and no safety. The workbook proposes a contract; an admin publishes it (ADR-008). This is the same principle as ADR-005: the system of record changes only through a governed gate.

## Open items

1. **The physical storage representation.** Per-object tables, JSONB-backed generic store, or hybrid. Leaning JSONB-first for v1 (above), to be confirmed by a prototype and then promoted to its own ADR with the evidence.
2. **How identity rules are expressed.** Whether record identity is a declared deterministic key (for example, normalized email plus organization) or an agent-judged match with a confidence signal, which ties to the unresolved confidence-gate question in ADR-005 and ADR-010.
3. **Self-service depth in v1.** v1 is developer-assisted (the first contract is configured for the client, seeded from their real workbook) while the engine already behaves as contract-driven. The polished self-service contract editor is a later layer, not a v1 requirement, and ADR-016 treats setup as a productized service rather than self-serve.
