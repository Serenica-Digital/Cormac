# ADR-003: Supabase/Postgres as the single system of record

**Status:** Accepted (the record-storage representation it deferred is settled by ADR-019)
**Date:** 2026-06-06
**Related:** Provides the storage for ADR-002 (the contract and records) and owns the physical record-representation question ADR-002 raises. ADR-005 (the control plane is the only writer) writes here with the service role, ADR-011 (auth) uses Supabase Auth as the session broker, ADR-014 (Lovable for the UI) reads here under RLS, and ADR-015 (security) depends on the RLS, secrets, and audit discipline this decision commits to.

## Context

A contract-first, multi-tenant CRM needs an operational data layer with specific properties: relational business records, versioned contracts, append-only audit, many-to-many relationships, strong tenant isolation, SQL reporting, and a UI builder that can sit on top without owning the trust boundary. The choice of that layer constrains everything above it, so it is worth deciding deliberately rather than defaulting.

Two practical pressures shaped the shortlist. The build will lean on Lovable for the UI (ADR-014), which understands Supabase Auth and RLS natively, and the original plan reached for whatever data layer carried the most ready-made connectors. The decision below keeps the convenience without letting the connectors become the architecture.

## Decision

Supabase/Postgres is the canonical operational source of truth. It holds workspaces, users, roles, memberships, schema contracts and their versions, business records stored against the active contract version, source messages, proposals, audit events, integration settings, and sync state.

### 1. Postgres is the right substrate

Relational tables fit the product's core nouns: contracts and their versions, records that reference a contract version, append-only audit with before-and-after values, many-to-many relationships between business objects, and the SQL reporting the weekly change report and admin views will need. Postgres also keeps a future self-host or per-tenant-project option open, which matters for the managed and higher-trust tiers in ADR-016.

### 2. Supabase is acceptable for professional SaaS, with discipline

Supabase provides managed Postgres, Auth, Storage, Edge Functions, RLS, and backups, and it is SOC 2 Type II compliant with HIPAA available as an add-on, so the platform vendor does not block future vendor-risk review (ADR-015). The real IT concern is never "Supabase versus Firebase." It is whether tenant isolation is correct, whether RLS is right, whether service keys stay server-side, whether writes are approval-gated and audited, and whether backups and a DPA exist. Those are our responsibilities, and they are commitments here, not assumptions.

### 3. RLS is a backstop, not the primary gate

Row-level security and database constraints enforce tenant isolation as defense in depth. Authorization decisions are owned by the control plane (ADR-005, ADR-011), which verifies the user, loads workspace membership and role, and decides what is allowed before it acts. The service role key lives server-side only, never in the browser or in Lovable-generated frontend code, which is why the trust-critical logic cannot live in the generated UI (ADR-014). Edge Functions are reserved for light webhook and glue work; the agent orchestration, proposal pipeline, and integrations live in the control-plane service (ADR-005, ADR-006), not scattered across database functions.

### 4. This ADR owns the record-storage representation question

ADR-002 raised it and stated the leaning: a JSONB-backed generic `business_records` store for v1, validated against the active contract with Zod, with hot or queried fields promoted to typed columns later. The reason it lands here is that the choice is a Postgres-shaped decision (GIN indexes, generated columns, constraint placement, and how RLS attaches to records). It stays an open item below until a prototype produces evidence, at which point it is promoted to its own ADR.

## Consequences

- The foundation only holds if the implementation is disciplined: correct RLS on every tenant table, a `workspace_id` on every tenant row, service keys server-side, no loosely-generated app with weak policies, and cross-tenant isolation tests. ADR-014 and ADR-015 carry that discipline as requirements rather than aspirations.
- Whatever record representation wins, RLS has to hold over it. A per-object-tables representation gives per-object RLS for free; a JSONB store enforces isolation on a `workspace_id` column and leans harder on the control plane. This couples the storage choice to the security model, which is why it is not a throwaway detail.

## Alternatives considered

**Firebase / Firestore.** More brand-familiar to some IT teams, with strong compliance coverage through Google. Rejected because the document model is the wrong fit for a relational, contract-driven CRM with audit-heavy writes, many-to-many relationships, schema versioning, and SQL reporting. Firestore can do a great deal, but a schema-contract CRM with Excel mapping, approval queues, and chronological audit is exactly the relational, query-heavy shape Postgres is built for and the document model is not.

**Airtable as the source of truth.** The most tempting alternative, because Airtable is a spreadsheet-database hybrid close to the product's own surface, and the Lovable Airtable connector is built for apps where the data lives in Airtable. Rejected as the core for concrete reasons (see [docs/research/excel-schema-contract-and-sync.md](../research/excel-schema-contract-and-sync.md) and the platform research): the Lovable connector uses a single Airtable personal access token with that token's scopes and no per-end-user auth, it cannot receive Airtable webhooks or change events, and the Airtable API carries rate limits (on the order of five requests per second per base, one hundred records per page, plus monthly call limits on lower tiers). That is fine for an internal tool or a single-client CRM. It is the wrong substrate for a multi-tenant SaaS that must own tenant isolation, per-user audit, agent-write safety, and schema versioning. Airtable stays viable as a future import source or as design inspiration for the contract UI, not as the canonical layer.

**Notion as the data home.** Considered in the original engagement. Rejected for a product because Notion databases lack uniqueness constraints, so there is no dedup safety net (the agent's judgment is the only thing between you and a second Dave), and relations, rollups, and formulas do not export cleanly, so the data is portable as values but not as structure. Both are disqualifying for a system of record.

## Open items

1. **Record storage representation.** The JSONB-first-then-promote leaning from ADR-002, to be confirmed by a prototype and recorded as its own ADR with the evidence (querying, indexing, RLS grain, and contract-change ergonomics). *Resolved by ADR-019: a JSONB-backed hybrid with hot fields promoted to generated indexed columns, confirmed by the prototype.*
2. **Database-level tenancy.** One shared multi-tenant project for the pilot, with separate projects or databases for high-trust and managed-single-tenant clients as a later tier (ADR-016). The cutover point and the migration story are unresolved.
3. **Backups and restore evidence.** The tested backup and restore procedure that the security packet needs (ADR-015).
