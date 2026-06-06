# Excel Schema Contract And Sync: Research Note

Status: research/application note
Date reviewed: June 5, 2026

## Why This Topic Matters

Excel is central to the product thesis because target customers already use spreadsheets to manage relationship and deal data. The important distinction is:

> Excel can be a schema/data interface without being the unconstrained operational database.

The product should support client-specific schema contracts and allow Excel tables to define, map, import, export, and eventually sync data. It should not promise full arbitrary bidirectional sync with any spreadsheet in v1.

## Direct Relevance Rating

10/10.

This is one of the core product differentiators. It shapes the data model, Microsoft connector strategy, Lovable/Supabase foundation, onboarding flow, agent context, and future "Excel-native CRM" positioning.

## Source Takeaways

### Microsoft Graph Supports Excel Workbooks

Microsoft Graph provides APIs for Excel workbooks stored in OneDrive and SharePoint, including workbooks, worksheets, ranges, tables, rows, and sessions.

Project implication:

- Controlled Excel integration is feasible.
- Excel tables can be read/written through Microsoft Graph when the user/customer grants permissions.
- Manual upload/import can exist separately from Graph.

### Workbook Sessions Matter

Microsoft Graph supports workbook sessions, including persistent sessions that save changes and non-persistent sessions that do not. Sessions help performance and consistency for workbook operations.

Project implication:

- Excel sync should be treated as a job/process, not a casual single API call.
- Sync jobs need session handling, retry behavior, and error states.

### Excel APIs Have Error And Unsupported-Feature Cases

Microsoft documents workbook API error handling and failure modes. Workbook access can fail because of unsupported features, request limits, access conflicts, payload constraints, or other workbook/session issues.

Project implication:

- Do not build v1 around arbitrary workbook regions.
- Prefer approved workbook templates and table contracts.
- Surface sync/import failures clearly to admins.

### DriveItem Delta Can Track File Changes

Microsoft Graph supports delta queries for DriveItems. This can help detect file changes over time.

Project implication:

- Later sync versions can use file metadata/delta patterns.
- V1 can start with manual import or explicit sync runs before always-on background sync.

## Contract-Based Excel Model

Recommended framing:

> Excel tables define or mirror a schema contract. Supabase/Postgres owns the operational CRM state.

The contract should define:

- Object/table name.
- Field name.
- Internal field ID.
- Display label.
- Data type.
- Required/optional.
- Enum options.
- Relationship fields.
- Sync direction.
- Human-editable versus app-managed fields.
- AI-editable versus human-only fields.
- Validation rules.

## Required Invariants

### Stable Row Identity

Each synced data row needs a durable app record ID, such as `crm_record_id`.

Why:

Excel row order, sorting, copying, and deletion are not reliable identity mechanisms.

### Stable Field Identity

Each field needs an internal field ID independent of the Excel column label.

Why:

Users may rename columns. The product must distinguish label changes from new fields.

### Schema Versioning

Contracts should be versioned.

Why:

Schema changes affect imports, sync, agent prompts, validation, and reporting.

### Sync Snapshots

The product should keep last-synced values and metadata.

Why:

Conflict detection requires knowing what changed in Excel, what changed in the app, and when.

### Explicit Conflict Handling

If the same field changes in Excel and the app since the last sync, create a conflict/proposal rather than silently choosing a winner.

## Sync Levels

### Level 0: Manual Upload

User uploads an Excel file.

Pros:

- No Microsoft Graph required.
- Fastest onboarding.
- Useful for prototypes.

Cons:

- Not ongoing sync.
- User must upload a fresh file.

### Level 1: Excel-Authored Contract

User provides controlled tables describing objects and fields.

Pros:

- Tests schema-contract thesis early.
- Keeps Excel familiar.
- Avoids arbitrary workbook sync.

Cons:

- Needs validation UI and error handling.

### Level 2: Controlled Import/Export

App imports/exports data against known contract-defined tables.

Pros:

- Useful and testable.
- Good v1 candidate.

Cons:

- Still not live sync.

### Level 3: Selected Workbook/Table Sync

User connects a specific OneDrive/SharePoint workbook/table.

Pros:

- Real Microsoft integration.
- Can support ongoing updates.

Cons:

- Requires Graph permissions, session handling, conflict logic, and sync runs.

### Level 4: Arbitrary Existing Workbook Sync

App syncs with whatever spreadsheet the client already uses.

Pros:

- Maximum compatibility if solved.

Cons:

- High complexity: formulas, hidden sheets, merged cells, renamed columns, deleted rows, missing IDs, ad hoc structure, permissions, and support burden.

Recommendation:

Defer Level 4.

## V1 Recommendation

Build schema-contract support from the beginning:

- Object/field metadata.
- Stable internal IDs.
- Excel mappings.
- Contract validation.
- Contract versioning.
- Controlled import/export.

V1 can be developer-assisted rather than fully self-service:

- The design partner is the first contract.
- Excel can author or map the first contract.
- The internal app model still behaves as contract-driven.

Do not hard-code the design partner's schema into the application model.

## PRD Language

Use:

> The platform supports client-specific schema contracts. Excel can be used as a familiar contract and data surface for defining, importing, exporting, and eventually syncing structured CRM data. The app maintains the operational system of record for permissions, source messages, proposals, audit trails, relationships, and sync history.

Avoid:

> The app will fully sync with whatever Excel file the client already uses.

## Open Questions

- Should v1 support manual upload only, or Microsoft file picker as well?
- Should the first contract be authored in Excel or configured in the app?
- Which fields are app-managed and should not be editable in Excel?
- How should deletes be handled: row deletion, archive field, or review queue?
- How much conflict resolution belongs in v1?

## Sources

- Microsoft, Working with Excel in Microsoft Graph: https://learn.microsoft.com/en-us/graph/api/resources/excel
- Microsoft, Workbook createSession: https://learn.microsoft.com/en-us/graph/api/workbook-createsession
- Microsoft, Excel API error handling: https://learn.microsoft.com/en-us/graph/workbook-error-handling
- Microsoft, Workbook table row resource: https://learn.microsoft.com/en-us/graph/api/resources/workbooktablerow
- Microsoft, DriveItem delta: https://learn.microsoft.com/en-us/graph/api/driveitem-delta
- Microsoft, OneDrive file picker: https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/js-v72/

