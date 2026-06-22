# ADR-004: Excel is a contract and work surface, not the operational database

**Status:** Accepted; the live data surface is settled in ADR-022 (contract-generated, contract-constrained workbooks; Excel guides while the control plane validates at sync).
**Date:** 2026-06-06
**Related:** Makes the Excel scope concrete for ADR-002 (contract-first data model) and resolves the "bidirectional sync" framing from ADR-001. Excel writes route through ADR-005 (the control plane is the only writer), live workbook access depends on ADR-012 (Microsoft connector), canonical state lives in ADR-003 (Supabase), and the schema-mapping work is one of the two agent roles in ADR-008. ADR-022 refines the live Excel surface, and ADR-023 covers the authoring agent that produces the contract.

## Context

Excel is central to the value proposition. The target customers already run their relationship and deal data in spreadsheets, and the wedge is meeting them there rather than forcing a migration into a generic CRM (ADR-016). The partner's opening ask on the pivot call went further, to full bidirectional sync with whatever spreadsheet the business already uses, with the holy grail being clients who live in Excel, OneDrive, and SharePoint getting their data kept in sync both ways. That literal version is the trap, and naming why is the point of this ADR.

Arbitrary Excel does not provide the invariants an app and an agent need. A real workbook has renamed columns, deleted and reordered rows, formulas, hidden sheets, merged cells, multiple tabs, concurrent editors, duplicate rows, formatting used as meaning, and no stable identity. Microsoft Graph does expose workbooks, worksheets, ranges, tables, rows, and sessions, and it supports delta queries for detecting file changes, so controlled integration is genuinely feasible (see [docs/research/excel-schema-contract-and-sync.md](../research/excel-schema-contract-and-sync.md)). But Graph also documents real failure modes: unsupported features, request limits, access conflicts, and payload constraints, and workbook access is a session-based job, not a casual single call. The conclusion is not that Excel cannot be integrated. It is that the unconstrained version does not hand the system stable record IDs, field types, relationships, validation, or conflict resolution, and bolting those on after the fact across arbitrary workbooks is a product by itself with a heavy support burden.

## Decision

Excel is a schema, data, and work surface. It is never the operational database. Supabase owns canonical state (ADR-003).

### 1. The three roles Excel plays

- **Author or map the contract.** A workbook is one way a client defines their objects and fields. The Workbook Contract Agent reads tables, columns, types, and sample values and proposes a semantic contract for review (ADR-008, ADR-002).
- **Controlled import and export.** Records move in and out against the contract-defined tables, with mappings and validation.
- **A later draft-and-sync round-trip.** Excel becomes a real update surface without becoming a second write path.

### 2. The draft-and-sync round-trip keeps write authority in the control plane

1. The user opens the workbook or table, and the add-in loads the latest canonical CRM data.
2. Rows carry hidden, stable metadata: record ID, field IDs, contract version, and a last-synced timestamp or hash.
3. The user edits in Excel normally. Nothing writes to the CRM yet.
4. The user submits. The add-in sends the changed snapshot or delta to the control plane.
5. The control plane computes a diff, and each change becomes a proposal through the same pipeline as every other surface (ADR-005).
6. The same validation, permission, confirmation, audit, and weekly-report machinery applies.
7. After approval, Excel refreshes from canonical state.

Excel is allowed to create drafts. The control plane decides what those drafts mean and whether they become writes. That single rule is what lets Excel stay central to the pitch while keeping the product safe.

### 3. Sync levels, staged

| Level | Capability | v1 status |
| --- | --- | --- |
| 0 | Manual workbook upload and import | In. Needs no Graph consent. |
| 1 | Excel-authored or Excel-mapped contract | In. Tests the contract thesis early. |
| 2 | Controlled import and export against contract tables | In. The data foundation. |
| 3 | Sync of a selected OneDrive or SharePoint workbook or table | Later, feature-gated. Needs Graph, sessions, conflict logic (ADR-012). |
| 4 | Sync with an arbitrary existing workbook | Deferred, out of scope. |

### 4. Required invariants

Stable record IDs (an Excel row order, sort, copy, or deletion is not identity), stable field IDs independent of column labels (a renamed column is not a new field), schema versioning, last-synced snapshots, and conflict-as-proposal rather than a silently chosen winner. If the same field changed in Excel and in the app since the last sync, the system creates a conflict for review instead of picking a winner.

## Consequences

- A later Excel add-in becomes a strategic surface, the draft-and-sync interface living inside the client's Excel and calling the control plane. It is deferred, and it inherits the generic-contract burden of ADR-002, because the add-in renders contract-defined tables, not bespoke ones.
- Live workbook read or write against OneDrive and SharePoint depends on the Microsoft Graph connector at Level 3 (ADR-012). Manual upload at Level 0 works with no Graph consent at all, which keeps onboarding unblocked when a client cannot get admin consent.
- Excel is one more adapter over the one pipeline (ADR-007), so it reuses the diff-to-proposal logic rather than inventing a second write path.

## Alternatives considered

**Full arbitrary bidirectional sync as a v1 promise.** The partner's holy-grail framing. Rejected for v1 and deferred as Level 4. Formulas, merged cells, missing IDs, renamed columns, deleted rows, hidden sheets, and concurrent edits make it a major product on its own, and promising it early sets an expectation the architecture should not carry. Any client-facing material should say "we turn your tables into a governed contract," not "we sync with whatever spreadsheet you have."

**Excel as the database.** Let the workbook be the store and sync the app around it. Rejected because it forfeits the invariants (stable identity, types, validation, audit, conflict rules) that make agent writes safe, which is the entire point of the contract model (ADR-002).

**Ignore Excel, accept CSV import only.** Simplest, and it abandons the wedge. Rejected because Excel and Microsoft fluency is a structural advantage the incumbents will not lead with, since their business is getting customers off spreadsheets (ADR-016).

## Open items

1. **First Excel mode in v1.** Manual upload only, or a Microsoft file picker as well, which trades a little Graph friction for a smoother selection experience.
2. **Conflict-resolution depth in v1.** How much of the conflict-to-proposal machinery ships with import/export versus waits for the Level 3 round-trip.
3. **Add-in timing.** Whether the Excel add-in is a v1.5 or v2 surface, gated on the contract pipeline and the draft-and-sync diff engine existing first.
