# Requirements and Acceptance Criteria

> **Status:** draft · **Last reviewed:** 2026-06-06

This document converts the contract-first CRM agent platform PRD into numbered requirements. It uses the current recommended v1 package until the team makes final product decisions.

Priority key:

- P0: required for v1 pilot.
- P1: strong v1 candidate or v1.1.
- P2: later product milestone.
- Deferred: explicitly out of v1.

## Product Foundation

### REQ-001: Multi-Tenant Workspace

Priority: P0

The product must support an organization/workspace boundary so users, records, agent settings, and audit logs are scoped to the correct tenant.

Acceptance criteria:

- A user belongs to one or more organizations/workspaces.
- CRM records are scoped to a workspace.
- Agent settings are scoped to a workspace.
- Audit events include workspace ID.
- Users cannot access records from another workspace through the UI or API.

### REQ-002: Role-Based Access Control

Priority: P0

The product must support roles for normal users and privileged agent/admin functions.

Acceptance criteria:

- Supported roles include Owner/Admin, Agent Admin, Manager, User, and Read-only User.
- Only Owner/Admin can manage users and integrations.
- Only Agent Admin or Owner/Admin can change agent behavior.
- Read-only users cannot approve or apply CRM mutations.
- Permission failures are logged where security-relevant.

### REQ-003: PWA/Web App Control Surface

Priority: P0

The v1 product must ship as a browser-based web app, with PWA installability if practical.

Acceptance criteria:

- Users can access the CRM through a web browser.
- Core contract-defined CRM screens work on desktop and mobile viewports.
- If PWA support is included, the app has a manifest and basic install behavior.
- Native desktop app is not required in v1.

## Contract-First Data Model

### REQ-009: Client Schema Contracts

Priority: P0

The product must support client-specific semantic contracts that define the structured business objects, fields, relationships, validation rules, aliases, identity rules, sync rules, and external mappings used by a workspace.

Acceptance criteria:

- A workspace can define a semantic contract for business objects and fields.
- Schema contracts include stable internal object and field IDs independent of display labels or Excel column names.
- Schema contracts can map external surfaces such as Excel tables to internal objects/fields.
- Schema changes are versioned and audited.
- Agent extraction and proposal tools use the active schema contract when generating proposed updates.
- V1 should begin with a schema-contract foundation rather than hard-baking the design partner's model. The first contract can be authored from the design partner's use case and may be configured by the developer rather than fully self-service, but the internal model should still use stable object/field/relationship definitions and mappings from the start.

### REQ-010: Contract-Defined Business Records

Priority: P0

The product must support business records whose object types are defined by the workspace's published semantic contract.

Acceptance criteria:

- Users can create, view, edit, archive, and search records for contract-defined object types.
- Object types such as People, Organizations, Deals/Opportunities, Properties/Assets, Facilities, Lenders, Tasks/Follow-ups, and Notes may be starter templates or design-partner contract objects, not mandatory global product tables.
- Record views and forms are generated or configured from the active contract.
- Records link to the contract version and field definitions that governed their creation/update where practical.
- Records include created/updated timestamps and creator/updater IDs.

### REQ-011: Starter Templates

Priority: P1

The product should support starter templates for common relationship/deal workflows without requiring every workspace to use those exact objects.

Acceptance criteria:

- Templates can include relationship/deal objects such as People, Organizations, Deals, Properties/Assets, Notes, Tasks, Facilities, Lenders, or Follow-ups.
- Templates can be renamed, hidden, or omitted based on the workspace contract.
- Template fields compile into the same stable object/field/relationship structure as workbook-derived objects.

### REQ-012: Source Message Object

Priority: P0

The product must preserve source context for agent-created proposals.

Acceptance criteria:

- Source messages can represent web-entered text, forwarded email, SMS, or imported spreadsheet rows.
- Source messages include channel, sender/user, timestamp, raw/normalized content where appropriate, and linked CRM records.
- Agent proposals link back to their source message.
- Sensitive source retention behavior is documented.

### REQ-013: Document Links

Priority: P1

The product should link CRM records to documents stored in Microsoft 365 without replacing SharePoint/OneDrive as the document system.

Acceptance criteria:

- Users can attach/store a document URL on a CRM record.
- The app can display linked document metadata when available.
- The app does not need to ingest full document contents in v1.

## Agent Proposal Loop

### REQ-019: SaaS Control Plane and Agent Runtime

Priority: P0

The product must define a SaaS Control Plane that owns safety-critical product behavior and can invoke a tenant-scoped agent runtime for reasoning work. Nous Hermes Agent is the current runtime candidate to evaluate, not a replacement for the control plane.

Acceptance criteria:

- Control Plane handles tenant routing, auth/session checks, RBAC, schema-contract workflows, diff/proposal generation, policy checks, connector webhooks, billing/usage metering, and integration adapters.
- Control Plane can invoke an agent runtime for tenant-scoped agent execution, skill loading, provider/model routing, MCP behavior, and scheduled agent tasks.
- Nous Hermes Agent is evaluated as a Dockerized/self-hosted runtime candidate with tenant-scoped profiles/configuration for the pilot.
- Lovable/web UI calls Control Plane APIs for safety-critical actions.
- Supabase stores state; Control Plane owns the workflow logic that interprets and mutates that state.
- n8n or similar workflow tools are not used as the canonical implementation of schema publishing, write approval, audit logging, permission enforcement, or the main agent pipeline.

### REQ-020: Agent Extraction

Priority: P0

The agent must extract CRM-relevant entities, facts, dates, and follow-up actions from a user-provided source message.

Acceptance criteria:

- The agent identifies candidate contract-defined records, fields, relationships, tasks/follow-ups, notes, and dates.
- The agent returns structured output suitable for validation before database writes.
- The agent marks uncertainty when it cannot confidently match an entity or interpret an instruction.
- Extraction output is stored as an Agent Proposal, not applied directly.

### REQ-021: Record Matching

Priority: P0

The product must attempt to match extracted entities to existing CRM records before proposing new records.

Acceptance criteria:

- The system searches existing records by contract-defined display fields, identity rules, relevant names, email addresses, organization/deal labels where applicable, and aliases where available.
- The proposal distinguishes matched records from new suggested records.
- Ambiguous matches require user selection or clarification.
- Match rationale or source fields are visible enough for review.

### REQ-022: Review Queue

Priority: P0

The product provides a review queue for agent proposals. In confirm-each mode it is the approval surface before changes apply; in apply-then-report mode it is the after-the-fact inspection/correction surface and holds anything flagged high-risk for explicit confirmation (see REQ-023).

Acceptance criteria:

- Users can see a list of pending and recently-applied proposals.
- Users can inspect proposed or applied field changes (before/after).
- Users can approve, edit, reject, or leave a proposal pending (confirm-each), or correct/revert an applied change (apply-then-report).
- Users can navigate from a proposal to its source message.
- The system records who reviewed/confirmed the proposal and when.

### REQ-023: Configurable Write Confirmation

Priority: P0

Write friction is a single configurable setting (per workspace, overridable per user), not a fixed global approval gate. It supports two modes, and both always write a full audit event, link the source message, and keep changes reversible.

Acceptance criteria:

- A workspace/user setting selects the confirmation mode: "confirm each update" or "apply-then-report".
- Confirm-each mode: agent-created mutations apply only after explicit user confirmation (e.g. text-back "yes"); no PIN-over-SMS.
- Apply-then-report mode: agent-created mutations apply immediately, with no per-update confirmation, and are surfaced in the weekly change report (REQ-026) plus reminders.
- High-risk actions (schema-contract edits, bulk operations, deletes) can require explicit confirmation even in apply-then-report mode.
- Rejected or unconfirmed proposals (in confirm-each mode) do not mutate CRM records.
- Apply and confirmation events are written to the audit log in both modes.
- New workspaces default to confirm-each; switching to apply-then-report is an Agent Admin action and is itself audited.

### REQ-024: Audit Trail

Priority: P0

The product must maintain an audit trail for agent proposals and applied CRM mutations.

Acceptance criteria:

- Audit events include workspace, actor, action, target record, timestamp, source channel, and before/after values where applicable.
- Agent-assisted events identify the proposal/tool/model path at a useful level.
- Users with appropriate permissions can view audit history for a record.
- Audit events are append-only through normal application flows.

### REQ-025: Reversal / Correction

Priority: P1

The product should allow an approved change to be corrected or reverted.

Acceptance criteria:

- Users can inspect before/after values for a change.
- Users can revert simple field updates where safe.
- Reverts create their own audit events.

### REQ-026: Weekly Change Report

Priority: P0 (safety net for apply-then-report mode, REQ-023)

The product must prepare a weekly report of CRM changes made since the previous report. This is the primary oversight mechanism when a workspace runs in apply-then-report mode, so it is load-bearing, not optional.

Acceptance criteria:

- Report lists applied CRM changes in chronological order.
- Report includes actor, source channel, affected record, change summary, and timestamp.
- Agent-assisted changes identify the originating source message/proposal where available.
- Report can be sent to configured recipients or viewed in the app.
- Report can be filtered by workspace, user, object type, or channel where practical.
- Complex reversals may require manual correction in v1.

## Interaction Channels

### REQ-030: Manual Web Update

Priority: P0

Users must be able to enter a natural-language update in the web app.

Acceptance criteria:

- User can enter update text from the web app.
- The update creates a Source Message.
- The agent processes the update into an Agent Proposal.
- Proposal appears in the review queue.

### REQ-031: Email Forwarding Ingestion

Priority: P1 (secondary channel)

The product should support forwarding an email or email thread to the agent as a secondary ingestion surface.

Acceptance criteria:

- A controlled forwarding address or shared ingestion mailbox receives messages.
- The system maps the inbound email to the correct workspace/user through address, token, or mailbox configuration.
- The system creates a Source Message from the email.
- The agent creates an Agent Proposal from the email content.
- Attachments may be ignored or linked in v1 unless explicitly scoped.

### REQ-032: SMS Update Ingestion

Priority: P0 (first-class design-partner surface)

The product must support texting updates, questions, and reminders to/from the agent. SMS is a first-class v1 interaction surface and design-partner requirement, not a deferred notification feature.

Acceptance criteria:

- Twilio webhook receives inbound SMS.
- Sender phone number maps to a known user/workspace.
- Unknown senders are rejected or handled safely.
- Inbound SMS creates a Source Message.
- Agent proposal is created and handled per the configurable confirmation setting (REQ-023): either text-back "yes" confirmation, or apply-then-report.
- The agent can answer read-only questions by SMS and send reminders/summaries by SMS.
- Outbound SMS responses include the result, and a review link for anything needing the web app.
- A2P 10DLC brand + campaign registration/compliance is completed before production US business texting (treated as v1 critical-path).

### REQ-033: Ask the CRM

Priority: P1

Users should be able to ask natural-language questions about CRM data.

Acceptance criteria:

- User can ask a question from the web app.
- The system answers using structured CRM records.
- The answer includes source references or linked records where possible.
- The system avoids unsupported factual claims when data is missing.
- Read-only users can ask questions without gaining write permission.

### REQ-034: Claude/MCP Connector

Priority: P2 / v1.5

The product should eventually expose a Claude connector through remote MCP as an external interface into the SaaS Control Plane and tenant-scoped agent runtime.

Acceptance criteria:

- MCP tools call Control Plane/product APIs.
- MCP tools enforce the same workspace and user permissions as the app.
- High-level tools include `ask_crm`, `capture_update`, `whats_pending`, and `prepare_brief` or equivalents.
- Thick tools route through the same schema contract, permissions, agent pipeline, proposal, confirmation, and audit model used by web/SMS/email/Excel.
- No raw write tools are exposed over MCP.
- Mutation-like tools create Agent Proposals or route through the configured confirmation model rather than directly applying writes.
- The distinction between Claude seats, Anthropic API usage, platform-provided model keys, and customer BYOK is documented.
- Connector authentication is documented.

## Microsoft and Excel

### REQ-040: Workbook Contract Ingestion

Priority: P0

The product must support workbook-driven contract ingestion as a core product capability.

Acceptance criteria:

- User/admin can upload or select an Excel workbook that represents existing business data.
- System detects sheets, tables, columns, sample values, formulas where relevant, and likely relationships.
- Workbook Contract Agent proposes a draft semantic contract.
- Admin/developer can review and edit object, field, relationship, alias, identity, and sync-rule suggestions.
- Accepted contracts create versioned schema definitions.
- Contract changes do not silently migrate production data or change agent behavior without review.

### REQ-041: Controlled Excel Import/Export

Priority: P1

The product should support controlled Excel import/export for contract-defined business records.

Acceptance criteria:

- Users can export contract-defined records to a controlled workbook/table format.
- Users can import from a controlled workbook/table format.
- Import flow shows a diff or review step before applying changes.
- Import errors identify invalid/missing required fields.
- Arbitrary existing workbook sync is not required.

### REQ-041A: Excel Draft-and-Sync Updates

Priority: P1/P2 depending pilot focus

The product may allow Excel to act as a draft update surface for contract-defined business records.

Acceptance criteria:

- CRM-backed Excel tables include stable record IDs, field IDs, contract version, and sync metadata where possible.
- User edits in Excel remain draft changes until submitted.
- Submitted workbook/table changes are diffed by the Control Plane.
- Diffed changes create proposal batches and use the same permissions, validation, confirmation, audit, and weekly-report behavior as other write surfaces.
- Conflict behavior is documented.
- Unsupported workbook situations fail safely with clear error reporting.

### REQ-041B: Excel Add-in

Priority: P2 / strategic later surface

The product may provide an Excel Office Add-in that lets users query and work with CRM-backed tables from inside Excel.

Acceptance criteria:

- Add-in can refresh CRM-backed tables from canonical state.
- Add-in can submit draft changes to the Control Plane for diff/proposal processing.
- Add-in can show sync conflicts or review links.
- Add-in does not directly mutate canonical CRM records.
- Add-in authentication and Microsoft deployment path are documented.

### REQ-041C: Controlled Excel Table Sync

Priority: P2 unless explicitly selected for v1

The product may support bidirectional sync with one approved workbook/table schema that maps to the workspace's schema contract.

Acceptance criteria:

- Sync is limited to a known workbook/table schema.
- Rows have stable IDs linking workbook rows to app records.
- Columns map to stable internal field IDs rather than relying only on display names.
- Conflict behavior is documented.
- Sync events are audited.
- Unsupported workbook situations fail safely with clear error reporting.

### REQ-042: Arbitrary Workbook Sync

Priority: Deferred

The product will not support arbitrary bidirectional sync with any existing client spreadsheet in v1.

Acceptance criteria:

- Proposal and PRD language explicitly defer this capability.
- V1 implementation does not depend on arbitrary workbook parsing or mutation.

### REQ-043: Microsoft 365 File Links

Priority: P1

The product should support linking CRM records to files in OneDrive/SharePoint.

Acceptance criteria:

- Users can add Microsoft 365 file links to CRM records.
- App requests only the Microsoft permissions needed for the selected implementation.
- Full file-content ingestion is not required in v1.

### REQ-044: Microsoft App Registration

Priority: P1 when Graph integrations are enabled

The product must use a documented Microsoft Entra app registration for Microsoft Graph integrations.

Acceptance criteria:

- Required Graph permissions are documented.
- Admin/user consent flow is documented.
- Permissions follow least-privilege principle.
- Publisher verification is planned before broader Microsoft-heavy beta.

## Agent Administration

### REQ-050: Agent Settings

Priority: P1

Privileged users should be able to configure limited agent behavior.

Acceptance criteria:

- Agent Admin can edit organization-level agent instructions.
- Agent Admin can configure field mappings or workflow rules where supported.
- Agent settings are versioned.
- Agent setting changes create audit events.
- Users can test changed settings before relying on them in production.

### REQ-052: Model Provider and AI Billing Modes

Priority: P1

The product should support a Claude-first model provider path while preserving future provider flexibility and buyer-specific billing modes.

Acceptance criteria:

- The Control Plane/runtime uses a model-provider adapter rather than scattering model calls directly through UI code.
- Platform-provided model key is supported as the default SMB mode.
- BYOK can be supported without giving up the product's prompt, contract, validation, and audit pipeline.
- Future customer endpoint/in-tenant model mode is represented as a later enterprise option.
- Product documentation distinguishes Claude seats/chat subscriptions from Anthropic API usage.

### REQ-051: Approval Thresholds

Priority: P1

The product should support configurable approval or confidence behavior.

Acceptance criteria:

- Workspace can define whether all writes require approval.
- New workspaces default to confirm-each mode unless explicitly configured otherwise by an Agent Admin.
- Low-confidence proposals are visually distinguished.
- Ambiguous proposals request clarification or manual review.

## Compliance and Trust

### REQ-060: Pilot Security Packet

Priority: P0 before organizational pilot

The product team must prepare a security packet as a first-class product deliverable before any organizational pilot with real data.

Acceptance criteria:

- Security packet folder exists and is linked from the PRD.
- Security overview drafted.
- Privacy policy drafted.
- Terms drafted.
- DPA template drafted.
- Subprocessor list drafted.
- Data-flow diagram drafted.
- Security architecture diagram drafted.
- Trust-boundary diagram drafted.
- Tenant isolation model drafted.
- Auth/RBAC model drafted.
- Audit logging model drafted.
- Agent runtime security model drafted.
- Secrets management policy drafted.
- Incident response policy drafted.
- Backup/restore plan drafted and tested or scheduled for test before pilot.
- Data retention/deletion policy drafted.
- Vulnerability/dependency management policy drafted.
- AI data handling statement drafted.
- Microsoft permission inventory drafted if Microsoft integrations are enabled.
- SMS compliance note drafted if SMS is enabled.
- Security questionnaire draft exists for customer review.

### REQ-061: Data Protection

Priority: P0

The product must protect customer CRM data using baseline SaaS security practices and produce evidence that the controls exist.

Acceptance criteria:

- Data is encrypted in transit.
- Data is encrypted at rest through platform/database configuration.
- Tenant/workspace ID is present on all tenant-scoped records.
- Supabase RLS policies exist for critical tenant-scoped tables.
- Cross-tenant access tests exist for critical tables and protected APIs.
- Control Plane verifies session/JWT and workspace role before protected actions.
- Secrets are not stored in source code.
- Production credentials are access-controlled.
- Secrets/tokens/API keys are not logged.
- Backups exist for production data.
- Restore path is documented and tested where practical before pilot.
- Basic monitoring/logging is enabled.

### REQ-061A: Agent Runtime Containment

Priority: P0 before runtime handles real customer data

The tenant-scoped agent runtime must be contained so it cannot bypass the product's authorization, proposal, confirmation, and audit model.

Acceptance criteria:

- Runtime has no direct write credentials for canonical business records.
- Runtime receives only tenant-scoped context selected by the Control Plane.
- Runtime tools are allowlisted per workspace/tenant.
- Runtime output is validated before creating proposals or writes.
- Runtime output cannot directly apply high-risk actions such as schema changes, bulk operations, deletes, or permission changes.
- Runtime version and dependencies are pinned for pilot.
- Runtime logs are reviewed for customer-data and secret leakage risk.
- If Nous Hermes Agent is adopted, its tenant profile/instance isolation model is documented.

### REQ-061B: Feature Security Review

Priority: P0 process requirement

Every new surface, connector, or agent capability should pass a lightweight security review before implementation.

Acceptance criteria:

- Review identifies what data enters the feature.
- Review identifies who or what can trigger it.
- Review documents identity/provider verification.
- Review documents workspace/user mapping.
- Review documents whether the feature can read, propose writes, or apply writes.
- Review documents audit events and log exclusions.
- Review documents secrets/tokens/API keys involved.
- Review documents subprocessors receiving customer data.
- Review documents failure, retry, and ambiguity behavior.

### REQ-062: SMS Compliance

Priority: P0 when SMS is enabled for production

The product must comply with US business texting requirements for production SMS through Twilio or equivalent. Because SMS is a first-class design-partner surface, A2P 10DLC brand/campaign registration should be started early given uncertain carrier approval timelines.

Acceptance criteria:

- A2P 10DLC brand/campaign registration completed where applicable.
- Consent and opt-out language documented.
- STOP/opt-out handling is implemented or provider-managed.
- SMS source messages and outbound confirmations are logged.

### REQ-063: Microsoft Trust Milestones

Priority: P1/P2

The product should follow a Microsoft trust path if Microsoft 365 integrations are central to GTM.

Acceptance criteria:

- Company domain and Microsoft tenant are selected.
- Microsoft publisher verification requirements are tracked.
- Microsoft 365 Publisher Attestation readiness is tracked.
- Microsoft 365 Certification is treated as later strategic milestone, not a v1 prerequisite unless buyer requires it.

### REQ-064: SOC 2 Readiness

Priority: P2

The product should be designed for eventual SOC 2 readiness but not require SOC 2 certification for the first private pilot.

Acceptance criteria:

- Controls relevant to access, change management, incident response, vendors, backups, and logging are documented.
- Evidence collection path is identified.
- SOC 2 Type I/Type II timing is not promised until buyer pressure and resources justify it.

## Explicit Non-Requirements for V1

- Full autonomous CRM writes.
- Arbitrary bidirectional Excel sync.
- Silent schema mutation from uploaded workbooks.
- Deep Outlook calendar intelligence.
- Native desktop app.
- Full document indexing/search.
- Self-hosted deployment.
- SOC 2 certification.
- Microsoft 365 Certification.
- Public Claude connector directory listing.
