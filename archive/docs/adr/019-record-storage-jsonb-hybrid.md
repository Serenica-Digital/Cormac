# ADR-019: Record storage is a JSONB-backed hybrid, confirmed by the prototype

**Status:** Accepted (resolves the open item ADR-002 deferred to a prototype)
**Date:** 2026-06-07
**Related:** This is the ADR ADR-002 promised: "the physical record-storage representation is deferred to ADR-003 and a prototype... promoted to its own ADR with the evidence." It settles ADR-002's open item 1. It lives inside ADR-003 (Supabase as the system of record), it is the grain RLS and tenant isolation operate over (ADR-015), the contract validation that guards every write is ADR-002's meta-schema enforced at the ADR-005 boundary, and the table layout is part of [docs/security/tenant-isolation.md](../security/tenant-isolation.md) and [docs/security/audit-logging.md](../security/audit-logging.md).

## Context

ADR-002 named the single most consequential technical choice in the product, how contract-defined records are physically stored, and deliberately did not close it. It weighed three candidates (per-object physical tables generated from the contract, a single generic JSONB-backed store, and a hybrid), leaned JSONB-first for v1, and committed to re-opening the question "the moment the prototype produces evidence, rather than being treated as closed." The walking skeleton produced that evidence: it built the store, wrote and read real records through it, and ran the cross-tenant isolation test against it. This ADR records the confirmed decision and the evidence behind it.

The forces ADR-002 identified still frame the choice. Per-object tables give the best native querying, indexing, and constraints, but turn every contract change into runtime DDL (create and alter table, per tenant), which makes a routine "the client added a field" into a migration-safety and rollback problem. A generic JSONB store makes contract changes pure data writes with trivial versioning, at the cost of weaker native querying and constraints enforced in application code. The product's premise is that each client defines and evolves their own schema, so the operation that must be cheap and safe is "change the contract," and that is exactly the operation DDL makes expensive.

## Decision

Business records are stored in one generic, JSONB-backed table, with the heavily-used fields promoted to generated, indexed columns. Contract changes are data, never DDL.

### 1. The table

`business_records` holds every business object of every type for every workspace:

| Column | Purpose |
| --- | --- |
| `id` | Stable record identity (UUID), independent of any field value. |
| `workspace_id` | The tenant boundary on every row; the grain RLS enforces (ADR-003, ADR-015). |
| `object_api_name` | Which contract object this row is an instance of (`person`, `deal`, ...). |
| `contract_version_id` | The contract version that governed this record, so history is interpretable (ADR-002). |
| `data` | The contract-defined field values, as JSONB. |
| `gen_name`, `gen_email`, `gen_status` | Generated columns materialized from `data` for indexed lookup (see below). |
| `created_by`, `updated_by`, `created_at`, `updated_at`, `archived_at` | Provenance and soft-delete. |

### 2. The hybrid: JSONB by default, generated columns for the hot fields

All contract fields live in `data`. The fields the system queries and matches on are promoted to Postgres generated columns computed from `data` and indexed:

- `gen_name` as `coalesce(data->>'full_name', data->>'name')`, `gen_email` as `data->>'email'`, `gen_status` as `data->>'status'`, each with a btree index scoped by `workspace_id`.
- A GIN index on `data` for arbitrary field queries the generated columns do not cover.
- A btree index on `(workspace_id, object_api_name)` for listing records of a type.

This is the hybrid ADR-002 described, with a concrete promotion mechanism: a hot field graduates from "a key in `data`" to "a generated indexed column" (and later, if reporting demands it, to a typed per-object table) without the record rows or the contract changing shape. Promotion is an additive migration on the operational table, not per-tenant DDL driven by a contract change.

### 3. Validation is at the boundary, not in the column type

Because `data` is schemaless to Postgres, field types are enforced by the control plane, not the database. Every write is validated against the active contract with Zod before it lands (`recordDataSchema` derives a per-object schema from the contract's field definitions, enforcing required-on-create, enum membership, date and email formats, and so on). This is ADR-005's boundary discipline applied to storage: the database stores what the control plane has already proven legal against the contract.

### 4. Contract change is a data write

Publishing or changing a contract inserts a `contract_versions` row and flips the active flag (a partial unique index guarantees one active version per workspace). No table is created or altered. Records continue to reference the version that governed them. This is what makes the product's core operation, evolving a client's schema, cheap and reversible.

## Evidence from the prototype

- The live skeleton creates and reads `person` records through this store end to end (capture, match, propose, approve, write, read), validated against the active contract on every write.
- The cross-tenant isolation test passes against this representation: RLS over the `workspace_id` column keeps workspace B from reading or writing workspace A's rows, which answers ADR-002's hard requirement that "RLS and tenant isolation must hold over it, whatever the storage representation."
- The generated columns index exactly the fields the runtime matches on (name, email, status), so the matching path the agent uses is an indexed lookup, not a JSONB scan.

## Consequences

### Operational

- The operation the business depends on, changing a client's contract, is a data write with no DDL, no per-tenant migration, and trivial versioning. This is the payoff that justifies the representation.
- RLS operates at `workspace_id` grain rather than per-object grain. That is weaker in principle than per-table policies, and it is the deliberate trade; the isolation test exists precisely to keep it honest as the schema grows.

### Architectural

- Field-level type and constraint enforcement lives in `packages/contract` (Zod), validated at the control plane. The database is the durable store and the RLS backstop, not the type authority. The contract is the type authority.
- The audit trail records whole-record before/after JSON (ADR-005, ADR-010), which is natural over a JSONB row. Per-field history is not modeled yet; see open items.

### Risk accepted

- Heavy analytical or cross-object reporting over JSONB will eventually outgrow generated columns and GIN. The mitigation is the promotion path (hot fields to typed columns, hot objects to typed tables), taken when real reporting patterns justify the operational cost, exactly as ADR-002 framed it. The risk is that we promote too late and feel query pain first; the cost of promoting is additive and contained, so this is an acceptable "decide on evidence" posture.

## Alternatives considered

These are ADR-002's three candidates, now decided with prototype evidence.

**Per-object physical tables generated from the contract.** Best native querying and constraints. Rejected as the v1 default because it makes every contract change runtime DDL per tenant, turning the product's most common and most important operation into a migration-safety problem, which directly fights the premise that clients define and evolve their own schema. It remains the promotion target for specific hot objects when reporting load justifies it.

**Pure key-value or EAV for record values.** Rejected: slow for common operations (list all people, filter by status), awkward typing, and no better at the thing JSONB is bad at. The generated-column hybrid gets the indexed-lookup benefit without the EAV join cost.

**JSONB with no generated columns.** Simpler, but pushes every filter and match onto GIN or full scans. Rejected because the fields the agent matches on are known and finite; materializing them as indexed generated columns is cheap and removes the obvious hot-path scan.

## Open items

1. **Promotion triggers.** Which fields or objects graduate from JSONB to typed columns or per-object tables, and on what signal (query latency, reporting requirements). Decided per object when the evidence appears, not pre-emptively.
2. **Field-level history.** The audit trail holds whole-record before/after; whether to add per-field versioning is a separate decision tied to ADR-009 (governed learning) and ADR-015 (audit detail).
3. **Relationship querying.** Performance of cross-object relationship traversal over JSONB at scale, and whether relationship edges warrant their own indexed representation.
4. **Identity-rule expression over the store.** How declared identity rules (ADR-002 open item 2) are evaluated efficiently against generated columns versus `data`, tied to the confidence-gate question in ADR-005 and ADR-010.
