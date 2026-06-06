# V1 Scope and Architecture Matrix

> **Status:** canonical · **Last reviewed:** 2026-06-06

This matrix turns the contract-first product idea into implementation surfaces. It answers: what lives where, what we build, what we integrate, and what should not be promised in v1.

## Recommended V1 Architecture

```text
Users / Surfaces
  -> PWA / Web App
  -> Excel workbook / future Excel add-in
  -> SMS
  -> Email forwarding
  -> Future MCP/Claude connector
      -> SaaS Control Plane (Node/TypeScript API + workers)
          -> Workbook Contract Agent
          -> CRM Operations Agent
          -> Diff / Proposal Engine
          -> Policy + Permission Engine
          -> Model Provider Adapter
          -> Agent Runtime Adapter
              -> Nous Hermes Agent Runtime candidate
          -> Supabase/Postgres

Microsoft 365
  -> OneDrive / SharePoint documents stay in Microsoft
  -> Outlook/email is ingested only through controlled paths
  -> Excel supplies raw schema/data and can become a governed draft-update surface

Claude / MCP
  -> External interface into the Control Plane/runtime
  -> High-level tools only
  -> Does not bypass proposal/confirmation/audit model
```

## What Lives Where

| Surface | V1 Home | Notes |
| --- | --- | --- |
| Web/PWA UI | Lovable + GitHub | Lovable can generate/refine user-facing screens, with source controlled in GitHub. |
| Canonical business records | Supabase/Postgres | Contract-defined records, not fixed global People/Deals/etc. tables. |
| Schema contracts | Supabase/Postgres | Object/field/relationship definitions, aliases, identity rules, Excel mappings, versions, validation rules. |
| SaaS Control Plane | Node/TypeScript service | Owns tenant routing, auth, RBAC, proposal batches, contract publishing, integration adapters, billing, audit, and write safety. |
| Agent runtime | Nous Hermes Agent candidate | Optional Dockerized/Python runtime evaluated for skills, MCP, provider routing, messaging gateways, and cron-style tasks. |
| Agent proposals | Supabase/Postgres | Every proposed change should be stored before approval. |
| Audit log | Supabase/Postgres | Record user, source, before/after, timestamp, tool/model where relevant. |
| Documents | Customer Microsoft 365 | App stores links/metadata, not copies, unless explicitly required. |
| Email source content | TBD | Shared ingestion mailbox is lower-risk than full user mailbox monitoring. |
| SMS messages | App database + Twilio logs | First-class design-partner surface; messages need CRM source linkage and compliance handling. |
| Excel workbook | Microsoft 365 | Raw schema/data source and possible draft update surface; arbitrary sync deferred. |
| Excel add-in | Office Add-in / later | Strategic later surface for in-Excel query, refresh, draft submit, and conflict review. |
| Agent configuration | App database | Versioned and editable only by Agent Admins. |
| Integration logic | Control Plane | Microsoft Graph, Twilio, email parsing, sync jobs, Excel diffs, and MCP tools need server-side control. |
| Claude connector tools | Product-owned MCP server | Later thick interface into the Control Plane/runtime, no raw writes. |

## Build / Buy / Register

| Capability | V1 Action | Build / Buy / Register |
| --- | --- | --- |
| CRM web UI | Build with Lovable + GitHub refinement | Build |
| PWA installability | Add manifest/service worker as needed | Build |
| Auth | Supabase Auth initially, Microsoft SSO later if needed | Build/configure |
| Contract-defined CRM database | Supabase/Postgres schema | Build |
| Schema-contract foundation | Object/field/relationship metadata, stable IDs, validation, Excel mappings | Build |
| SaaS Control Plane | Node/TypeScript backend/API/worker | Build |
| Agent Runtime Adapter | Product bridge into runtime execution | Build |
| Nous Hermes Agent Runtime | Dockerized runtime spike, tenant-scoped config/profile | Evaluate |
| Workbook Contract Agent | Workbook detection + semantic-contract proposal workflow | Build |
| Supabase security baseline | RLS, tenant isolation, server-side secrets, audit logs, backup plan | Build/configure |
| Agent proposal queue | Product-specific UX/API | Build |
| Agent extraction/matching | Control Plane invoking runtime/model APIs | Build |
| Audit log | Product-specific schema/API | Build |
| Email forwarding ingestion | Inbound mailbox/parser or Microsoft Graph | Build/integrate |
| SMS update ingestion | Twilio webhooks | Integrate/register |
| A2P 10DLC | Required if US business texting is enabled | Register |
| Microsoft app registration | Required for Graph integrations | Register/configure |
| Microsoft publisher verification | Recommended before broader Microsoft-heavy beta | Register/verify |
| Microsoft Publisher Attestation | Later trust milestone | Register/attest |
| SOC 2 | Not v1 certification; design for readiness | Prepare later |
| Claude connector | Thick remote MCP server into Control Plane/runtime | Build later |
| Excel add-in | Office Add-in task pane/ribbon surface | Build later |
| Excel arbitrary sync | Major later feature | Defer |

## V1 Feature Matrix

| Feature | Recommended V1 | Why |
| --- | --- | --- |
| Web/PWA CRM | In | Operational control surface. |
| Contract-defined business records | In | Core CRM substrate comes from the semantic contract. |
| Schema-contract foundation | In | Prevents the design partner's model from becoming hard-coded product architecture. |
| Starter templates | Probably in | People/deals/properties/tasks can seed the first contract but should not become global assumptions. |
| Task/follow-up creation | In | High-value CRM automation when included in the active contract. |
| Agent proposal review queue | In | Trust and control mechanism. |
| Agent autonomous writes | Out | Too risky before audit/rollback is proven. |
| SMS update ingestion | In | First-class design-partner surface. Pulls Twilio/A2P/compliance onto the v1 critical path. |
| SMS questions + reminders | In | Ask/answer, reminders, summaries. |
| Email forwarding updates | In or P1 | Secondary ingestion surface. |
| Individual mailbox monitoring | Probably out | Privacy/admin-consent complexity. |
| Workbook-to-contract ingestion | In | Central to spreadsheet-contract-first product thesis. |
| Controlled Excel import/export | In | Supports Microsoft/Excel-native customers without full sync complexity. |
| Excel draft-and-sync | Optional stretch | Makes Excel an update surface while routing through Control Plane proposals/audit. |
| Excel add-in | Later / optional POC | Strategic in-Excel surface after contract pipeline exists. |
| Controlled Excel table sync | Optional stretch | Feasible but needs conflict rules. |
| Arbitrary bidirectional Excel sync | Out | Too broad for v1. |
| OneDrive/SharePoint document links | In | Useful and lower-risk than full file sync. |
| Full document ingestion/search | Out or later | Adds permissions, storage, indexing, and privacy risk. |
| Outlook calendar intelligence | Out | Hard to determine CRM-worthy events reliably. |
| Claude connector | Later v1.5 | Useful thick interface into Control Plane/runtime after tools/API are stable. |
| Client agent tuning | Limited in | Admin-editable instructions/rules with audit/versioning. |
| Model/provider selection | Out | Adds complexity before product behavior is stable. |
| Self-hosting | Out | Keep architecture portable, but do not build self-hosting first. |

## Interaction Surface Sequencing

### Web/PWA Control Surface

Role:

- Contract review/publishing.
- Proposal queue.
- Admin, integrations, audit, settings.
- Rich review of complex changes.

### Excel Contract and Work Surface

Flow:

```text
User uploads/selects controlled workbook
  -> Control Plane detects tables/columns/sample data
  -> Workbook Contract Agent proposes semantic contract
  -> admin reviews/publishes contract
  -> records import/export or draft-sync through proposal pipeline
```

Pros:
- Directly validates Microsoft/Excel-native product thesis.
- Useful for onboarding/migration.
- Avoids email/SMS ambiguity at first.

Cons:
- Less magical than agent ingestion.
- Sync can expand rapidly.
- Existing spreadsheets may not match controlled schema.

Recommended v1 version:

Workbook-to-contract ingestion plus controlled import/export. Draft-and-sync or Excel add-in are optional scope decisions.

### SMS Surface

Flow:

```text
User texts Twilio number
  -> Twilio webhook
  -> Control Plane authenticates sender
  -> Control Plane invokes runtime/model to extract structured proposal or answer
  -> confirmation/review behavior follows workspace setting
  -> CRM update + audit event if applied
```

Recommended v1 version:

SMS supports capture, lightweight questions, reminders, and summaries. Complex review should happen in the web app.

### Email Surface

Recommended v1 version:

Use a controlled forwarding address or shared ingestion mailbox before full mailbox monitoring.

## Suggested Pilot Sequence

### Sprint 0: Product and Data Design

- Confirm design partner/customer relationship.
- Choose first three workflows.
- Confirm system of record and contract-first data model.
- Decide v1 Excel depth.
- Decide interaction-surface sequence.
- Define compliance baseline.

### Sprint 1: PWA and CRM Skeleton

- Auth.
- Tenant/account setup.
- Schema-contract metadata model.
- Contract-defined record screens.
- Starter template for the design partner's records if useful.
- Basic search/filter.

### Sprint 2: Agent Proposal Engine

- Source message model.
- Agent extraction prompt/tooling.
- Record matching.
- Proposal creation.
- Review queue.
- Approve/edit/reject.
- Audit log.

### Sprint 3: Required Pilot Surfaces

- Workbook-to-contract ingestion.
- Controlled Excel import/export or narrow draft-and-sync.
- SMS ingestion with Twilio/A2P setup.
- Email forwarding if selected.

### Sprint 4: Microsoft Foundation

- Microsoft app registration.
- Minimal Graph permission set for chosen channel.
- OneDrive/SharePoint document-link support.
- Admin onboarding notes.

### Sprint 5: Pilot Hardening

- Backups.
- Tenant isolation checks.
- Logging/monitoring.
- Security packet.
- Prompt/config versioning.
- Pilot training and feedback loop.

## Estimate Bands

These are planning bands, not commitments.

| Scope | Rough Effort |
| --- | --- |
| Product definition / PRD / architecture | 15-30 hours |
| Clickable PWA prototype | 30-60 hours |
| Contract-defined CRM schema/API/UI | 80-160 hours |
| SaaS Control Plane backend foundation | 60-140 hours |
| Nous Hermes Agent Runtime evaluation | 20-60 hours |
| Workbook Contract Agent / ingestion wizard | 60-140 hours |
| Agent proposal loop | 60-140 hours |
| Email forwarding ingestion | 25-60 hours |
| SMS ingestion and reminders | 35-90 hours plus registration time |
| Controlled Excel import/export | 30-80 hours |
| Excel draft-and-sync / add-in proof of concept | 80-200 hours |
| Controlled Excel table sync hardening | 80-180 hours |
| Claude/MCP connector | 30-80 hours after API exists |
| Compliance/security packet | 20-60 hours, not counting legal review |
| Self-hosted deployment path | 80-200+ hours, deferred |

## Proposal Warning Language

Use direct language around the risky promises:

"The pilot will not attempt fully autonomous CRM mutation or arbitrary bidirectional sync with any existing spreadsheet. Those are later-stage capabilities that require conflict handling, auditability, permissions, and operational support. V1 is designed to prove the agent-assisted update loop safely: extract, match, propose, approve, apply, and audit."
