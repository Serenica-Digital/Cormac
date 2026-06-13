# Requirements and Acceptance Criteria

> **Status:** canonical · **Last reviewed:** 2026-06-12

Numbered requirements for the v1 pilot, kept aligned with the decision record. REQ IDs are stable and referenced from other docs; numbers are never reused. Priorities map to the milestone plan in [build-plan.md](build-plan.md): P0 is required for the pilot (v1), P1 is a strong candidate that may land inside M1-M8 without gating the pilot, P2 and Deferred are post-v1. Pane-specific acceptance criteria firm up at M1's GO/NO-GO ADR; they are written here to current knowledge (ADR-028 and [../research/microsoft-ecosystem-integration.md](../research/microsoft-ecosystem-integration.md)).

## Product Foundation

### REQ-001: Multi-Tenant Workspace

Priority: P0 — built

The product must support an organization/workspace boundary so users, records, agent settings, and audit logs are scoped to the correct tenant.

Acceptance criteria:

- A user belongs to one or more organizations/workspaces.
- CRM records, contracts, learned knowledge, proposals, and audit events are scoped to a workspace.
- Users cannot access records from another workspace through the UI or API.
- The cross-tenant isolation test suite is a CI gate, and the workspace purge path removes tenant data completely.

### REQ-002: Role-Based Access Control

Priority: P0 — built

The product must support roles for normal users and privileged functions.

Acceptance criteria:

- Roles are `owner`, `agent_admin`, `manager`, `member`, `read_only` (packages/shared is the source of truth).
- Only owner manages users; owner and agent_admin hold `publish_contract`.
- Manager and above decide proposals and learning (the learning decision reuses the `approve_proposal` capability).
- Read-only users cannot approve or apply CRM mutations.
- Permission failures are logged where security-relevant, and the RBAC matrix test covers every role-capability pair.

### REQ-003: Web App: Admin, Trust, and Fallback Surface

Priority: P0

The web app is the admin, trust, and fallback door (ADR-028 demoted it from primary). It must stay feature-complete for capture and review as the platform-risk floor.

Acceptance criteria:

- Role management, audit review, the learning queue, and workspace settings live in the web app.
- Capture and proposal review work in the web app without any Microsoft dependency.
- Core screens work on desktop and mobile viewports; PWA installability is optional.

### REQ-004: Excel Task Pane: Primary Client Surface

Priority: P0 — gated on M1's GO/NO-GO (ADR-028)

The product's primary client surface is an Office task pane add-in in Excel, hosting both agent experiences.

Acceptance criteria:

- One pane hosts day-to-day operations (capture, review queue, proposal diffs; M3) and the authoring interview against the live open workbook (M4).
- The pane is a thin SPA served from our own HTTPS infrastructure; it renders, relays, and executes Office.js surface actions; it holds no business logic, no write authority, and no secrets.
- Ships on the XML add-in-only manifest with ExcelApi 1.14 as the requirement floor; newer API sets are runtime-gated with `isSetSupported`.
- An approved write rendered back into the workbook via Office.js is a surface action on an already-audited decision, never a direct write path.
- Capture triggers are change events plus explicit user gestures; the design assumes no save event exists on the platform.
- Pilot distribution is admin upload (centralized deployment / Integrated Apps) or AppSource self-install; neither requires the AppSource listing to exist first.

## Contract-First Data Model

### REQ-009: Client Schema Contracts

Priority: P0 — built

The product must support client-specific semantic contracts that define the structured business objects, fields, relationships, validation rules, aliases, identity rules, the business glossary, and external mappings used by a workspace.

Acceptance criteria:

- A workspace can define a semantic contract for business objects and fields, with stable internal IDs independent of display labels or Excel column names.
- The contract carries the workspace glossary (terms, definitions, optional object/field scope) as part of the same versioned document (ADR-027).
- Publishing is server-authoritative and atomic: the control plane bumps the version, flips the single active flag, and writes the audit event in one transaction, behind the `publish_contract` capability.
- Agent extraction and proposal tools run against the active contract version.
- Records, proposals, and audit events reference the contract version that governed them.

### REQ-010: Contract-Defined Business Records

Priority: P0 — built

The product must support business records whose object types are defined by the workspace's published semantic contract.

Acceptance criteria:

- Users can create, view, edit, archive, and search records for contract-defined object types.
- Object types are never mandatory global product tables; storage is the JSONB hybrid of ADR-019.
- Record views and forms are generated or configured from the active contract.
- Records include created/updated timestamps and creator/updater IDs.

### REQ-011: Starter Templates

Priority: P1

Starter templates for common relationship/deal workflows, compiled into the same stable contract structure as workbook-derived objects, renameable and omittable per workspace.

### REQ-012: Source Message Object

Priority: P0 — built

Source context is preserved for agent-created proposals.

Acceptance criteria:

- Source messages represent web-entered text, SMS, or imported rows (email post-v1), with channel, sender/user, timestamp, content, and runtime telemetry.
- Agent proposals link back to their source message; sensitive retention behavior is documented in the security packet.

### REQ-013: Document Links

Priority: P1

CRM records can carry pasted Microsoft 365 document URLs (links and metadata only, no file content, no Graph consent required in v1).

## Agent Proposal Loop

### REQ-019: Control Plane and Agent Runtime

Priority: P0 — built (ADR-025/026)

The SaaS Control Plane owns safety-critical behavior and invokes the adopted Hermes runtime for reasoning work.

Acceptance criteria:

- The control plane owns tenant routing, auth, RBAC, contract workflows, the proposal pipeline, the learning gate, policy checks, connector webhooks, usage, and audit.
- Hermes (pinned image, Dockerized, stateless per task) runs agents as tool-users; its only reach into tenant data is the control plane's MCP tool surface at `/mcp`, authenticated by a workspace-scoped bearer token minted per task.
- A proposal is a schema-enforced tool call (`submit_proposal`), never parsed free text; invalid tool input is rejected, never written.
- The runtime is swappable behind the adapter; no workflow tool (n8n or similar) implements the canonical pipeline.

### REQ-020: Agent Extraction

Priority: P0 — built

The agent extracts CRM-relevant entities, facts, dates, and follow-ups from a source message, returns structured output via tool call, marks uncertainty, and never applies anything directly.

### REQ-021: Record Matching

Priority: P0 — built; quality work continues (#36)

Extracted entities are matched to existing records before new ones are proposed, using contract display fields, identity rules, aliases (contract-level and learned), with ambiguous matches routed to clarification or review.

### REQ-022: Review Queue

Priority: P0 — built; pane UI lands M3

The review queue is the approval surface in confirm-each mode and the inspection/correction surface in apply-then-report mode, with before/after diffs, source-message navigation, and reviewer attribution.

### REQ-023: Configurable Write Confirmation

Priority: P0 — confirm-each built; apply-then-report lands M7

Write friction is a per-workspace setting (overridable per user) with two modes; both audit fully and keep changes reversible.

Acceptance criteria:

- Confirm-each: agent-created mutations apply only after explicit confirmation; the default for new workspaces.
- Apply-then-report: validated agent mutations apply immediately and surface in the weekly report (REQ-026); switching modes is an agent_admin action, itself audited, and gated by the eval bar (REQ-027A).
- High-risk actions (contract edits, bulk operations, deletes, permission changes) require explicit confirmation in every mode.
- The learning gate follows the same workspace mode (ADR-027); v1 ships confirm-each, so all learning is held for human decision.

### REQ-024: Audit Trail

Priority: P0 — built

Append-only audit events with workspace, actor, action, target, timestamp, source channel, and before/after values; agent-assisted events identify the proposal/tool path; legibility work tracked (#42).

### REQ-025: Reversal / Correction

Priority: P1

Approved changes can be inspected (before/after) and simple field updates reverted, with reverts creating their own audit events.

### REQ-026: Weekly Change Report

Priority: P0 for apply-then-report (M7)

The weekly report lists applied changes (actor, channel, record, summary, timestamp, source link), includes what the agent learned that week, and is the load-bearing oversight mechanism for apply-then-report mode.

### REQ-027: Governed Learning Loop

Priority: P0 — built (ADR-027)

The agent improves per workspace only through governed, typed, reviewable data; the runtime keeps no memory.

Acceptance criteria:

- The agent proposes learning through the `propose_learning` tool into typed slots only: `alias` (a string variant bound to exactly one record) and `enum_synonym` (a workspace word mapped to a canonical field option). No free-text memory slot exists.
- Proposals validate against the active contract at propose time, are held `proposed`, decided by manager+, and re-validated at decision; only `active` rows reach the agent's context.
- Rows deduplicate on a natural key; revocation frees the slot and takes effect at the next compile; record-bound aliases cascade-delete with their record.
- Every transition is audited; there is no autonomous compaction or self-editing of learned content.

### REQ-027A: Eval Gate for Autonomy

Priority: P1 (gates REQ-023's apply-then-report; M7)

A starter eval set for entity matching and disambiguation must pass before a workspace switches to apply-then-report (#22), and the authoring interview carries its own eval bar including the plain-language register (M2).

### REQ-028: Compiled Workspace Context

Priority: P0 — built (ADR-027)

The agent's per-task knowledge is compiled by the control plane, never assembled by the runtime.

Acceptance criteria:

- Per task, the control plane compiles the active contract (glossary included) and active learned knowledge into one rendered block, joined against live records at compile time and passed through the redaction path.
- The render is deterministic and byte-stable (fixed section order, codepoint sorts, hostile content flattened inert) so the runtime's prompt-prefix cache holds across runs.
- Nothing enters the compiled context without passing the publish gate or the learning decision.
- Cost and latency are part of acceptance for changes here (the ADR-026/027 precedent: measured numbers on the tracking issue).

## Interaction Channels

### REQ-030: Manual Web Update

Priority: P0 — built

Natural-language updates entered in the web app create a source message, run the agent, and land a proposal in the review queue.

### REQ-031: Email Forwarding Ingestion

Priority: Deferred (post-v1)

Email moved out of v1 (build plan); SMS and the pane cover capture for the pilot. The design (controlled forwarding address, workspace mapping, source message) stands for when it returns.

### REQ-032: SMS Update Ingestion

Priority: P0 (M6)

Texting updates, questions, and reminders is a first-class design-partner surface.

Acceptance criteria:

- Twilio webhooks are signature-verified (arrival trust); the sender phone number resolves through the identity spine to a workspace user; unknown senders are rejected safely.
- Inbound SMS creates a source message; proposals follow the workspace confirmation mode (text-back "yes" in confirm-each).
- SMS-originated changes can only feed the proposal pipeline; high-risk actions require confirmation on a session-trust surface.
- The agent answers read-only questions and sends reminders/summaries by SMS; complex review links to the pane or web app.
- A2P 10DLC registration (#24, started during M1) completes before production US texting.

### REQ-033: Ask the CRM

Priority: P1 — partially live (the operations agent answers questions)

Natural-language questions answered from structured records, with source references, no unsupported claims, and no write permission implied.

### REQ-034: Claude/MCP Connector

Priority: P2 (post-v1)

An external MCP connector exposing thick tools (`ask_crm`, `capture_update`, `whats_pending`) over the same pipeline, permissions, and audit; no raw write tools; intended to authorize through Supabase so it joins the identity spine rather than adding a parallel token system.

## Microsoft and Excel

> The pane is the primary surface (REQ-004, ADR-028). The contract-generated, validate-at-sync workbook of ADR-022 is the post-v1 Excel data surface; the pane subsumes its interactive UX for the pilot. The v1 Microsoft posture is Graph stage zero: the add-in requires no Graph permissions at all.

### REQ-040: Workbook Contract Ingestion

Priority: P0 (M2 engine, M4 pane mount)

Workbook-driven contract authoring is the keystone capability.

Acceptance criteria:

- The system detects sheets, tables, columns, sample values, and likely relationships from a client workbook (proven in the spike; both fixtures).
- The Workbook Contract Agent runs a consultative interview (free-form with fixed checkpoints: structure agreed, fill, review) in the client's plain language, never database terms, and may propose a better structure than the workbook brought.
- The draft contract is reviewed and published by a human with the `publish_contract` capability; nothing takes effect unpublished.
- Contract changes never silently migrate production data or change agent behavior without review.
- In the pane (M4), the interview reads the live open workbook and can highlight the ranges it is asking about.

### REQ-041: Controlled Excel Import/Export

Priority: P1

Controlled import/export of contract-defined records through the pane or web, with a diff/review step before any import applies; arbitrary workbook sync is never required.

### REQ-041A: Excel Draft-and-Sync Updates

Priority: P2 (post-v1, with REQ-041D)

Excel as a draft update surface (edits diffed, proposal batches, same gates) follows the generated-workbook work.

### REQ-041B: Excel Add-in

Superseded by REQ-004. The add-in is not a later strategic surface; it is the primary surface.

### REQ-041C: Controlled Excel Table Sync

Priority: P2 (post-v1)

Bidirectional sync limited to the approved generated-workbook schema, with stable row IDs, documented conflict behavior, audited sync events, and safe failure. Server-side Graph writes, if used, are sequential per workbook and SharePoint/OneDrive-for-Business only.

### REQ-041D: Contract-Generated Constrained Workbook

Priority: P2 (post-v1, #29/#30; ADR-022 stands as the shape)

A workbook generated from the published contract with the contract expressed as native Excel rules (dropdowns, typed validation, hidden locked ID columns, protected headers); in-sheet validation guides, the Control Plane gates; off-contract rows become flagged proposals, never silent writes.

### REQ-042: Arbitrary Workbook Sync

Priority: Deferred (unchanged)

No arbitrary bidirectional sync with any existing client spreadsheet; proposal and PRD language state this explicitly.

### REQ-043: Microsoft 365 File Links

Priority: P1

Pasted OneDrive/SharePoint links on records, links and metadata only; no file-content ingestion, no Graph consent in v1.

### REQ-044: Microsoft App Registrations

Priority: P0 for the sign-in registration (M1); Graph registration post-v1

Two registrations with different weights, never conflated:

- A minimal Entra app registration with sign-in-only scopes (openid/profile) serves the pane's Lane A silent sign-in (NAA brokered into Supabase). Basic sign-in scopes are exempt from the unverified-publisher consent block, so this works before publisher verification.
- A Graph-permissioned registration arrives only post-v1, climbing the staged minimal-scope ladder (delegated before application, `Sites.Selected` before `Sites.Read.All`, mail/contacts lazily at feature invocation, never application-variant mailbox scopes). Entra publisher verification precedes any Graph consent ask.

## Agent Administration

### REQ-050: Agent Settings

Priority: P1

Privileged configuration is governed and narrow: workspace confirmation mode, learning decisions, and contract changes are the tuning paths. The runtime profile (SOUL) is versioned in the repo and changes through review, not through a customer-facing free-form prompt editor.

### REQ-051: Approval Thresholds

Priority: P1

Workspaces default to confirm-each; low-confidence proposals are visually distinguished; ambiguous proposals request clarification (#38) or route to review.

### REQ-052: Model Provider and AI Billing Modes

Priority: P1

Claude-first behind the provider seam (ADR-013): the runtime's model calls go through its provider adapter with the Anthropic key held by the runtime workload only; platform-key is the default SMB mode; BYOK remains possible without giving up the pipeline; documentation distinguishes Claude seats from API usage.

## Compliance and Trust

### REQ-060: Pilot Security Packet

Priority: P0 before organizational pilot

The packet ([../security/](../security/)) must read as a true summary of enforced controls when the pilot starts, including by then: the add-in deployment model and pane sandbox posture, the SMS compliance note, the learning-layer controls, and the AI data handling statement naming Anthropic as a subprocessor.

### REQ-061: Data Protection

Priority: P0 — baseline built, maintained

Encryption in transit and at rest, workspace ID on all tenant rows, RLS on tenant tables, cross-tenant tests as CI gates, JWT + role verification before protected actions, secrets out of source and logs, backups with a documented restore path, basic monitoring.

### REQ-061A: Agent Runtime Containment

Priority: P0 — built and tested

The runtime holds no database credentials; receives only control-plane-compiled context; reaches data only through the allowlisted MCP tools bound to one workspace per task; its output is schema-validated; it cannot apply high-risk actions; image and dependencies are pinned; the deny-hook and containment behavior are covered by tests (#44 tracks the CI gap).

### REQ-061B: Feature Security Review

Priority: P0 process requirement

Every new surface, connector, or agent capability passes a lightweight security review before implementation (data in, trigger, identity verification, workspace mapping, read/propose/apply class, audit events, secrets, subprocessors, failure behavior). The pane and SMS doors each get one before their milestone starts.

### REQ-062: SMS Compliance

Priority: P0 when SMS goes to production (M6)

A2P 10DLC registration completed, consent and opt-out language documented, STOP handling implemented or provider-managed, SMS messages and outbound confirmations logged.

### REQ-063: Microsoft Trust Track

Priority: P1, calendar-bound (#53)

DUNS, Partner Center enrollment, and business verification start during M1 (6-10 weeks end to end for a new LLC). Entra publisher verification precedes any Graph consent ask. Publisher Attestation is the post-listing trust milestone; full M365 Certification only on buyer pressure. None of it gates the pilot.

### REQ-064: SOC 2 Readiness

Priority: P2

Design for readiness (the control register is the evidence path); no certification promised until buyer pressure justifies it.

## Explicit Non-Requirements for V1

- Full autonomous CRM writes outside the governed apply-then-report mode.
- Arbitrary bidirectional Excel sync.
- Silent schema mutation from uploaded workbooks.
- Email ingestion (moved post-v1).
- The generated constrained workbook and validate-at-sync engine (post-v1).
- Any Microsoft Graph data permission (v1 is Graph stage zero).
- Free-text agent memory or autonomous learning compaction.
- Deep Outlook calendar intelligence; Outlook pane host.
- Native desktop app; full document indexing/search; self-hosted deployment.
- SOC 2 certification; Microsoft 365 Certification; the AppSource listing itself.
- Public Claude connector directory listing.
