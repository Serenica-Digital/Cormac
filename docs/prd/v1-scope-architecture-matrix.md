# V1 Scope and Architecture Matrix

> **Status:** canonical · **Last reviewed:** 2026-06-13

The scope cut for v1: what lives where, what we build versus integrate versus register, and what is explicitly not promised. v1 means the pilot live on the design partner's real business ([build-plan.md](build-plan.md), milestones M1-M8). The topology lives in [architecture.md](architecture.md); the data-and-knowledge view in [contract-model.md](contract-model.md). This doc is the cut, not the sequence or the why.

The original version of this matrix predates the runtime adoption (ADR-025/026), the knowledge layer (ADR-027), and the surface pivot (ADR-028). The big moves since: Hermes is adopted, not a candidate; the internal MCP tool server exists and is the spine; the Excel task pane replaced the web app as the primary client surface; email ingestion moved out of v1; the sprint plan and estimate bands this doc once carried are superseded by the milestone plan and are gone; and the environment, secrets, and deployment shape consolidated into one generated contract on managed Supabase, with Helm-on-k3d as the local-to-prod environment and a Terra packaging for Juno (ADR-037/038).

## What Lives Where

| Thing | Home | Notes |
| --- | --- | --- |
| Excel task pane (primary client surface) | Office add-in, SPA served from our containers | XML manifest, ExcelApi 1.14 floor; Office.js runs in Excel's webview, not our container. Build gated on M1's GO/NO-GO (ADR-028) |
| Web/PWA UI (admin, trust, fallback) | Lovable-built React app, source in GitHub | Roles, audit review, learning queue, settings; capture/review stay feature-complete as the platform-risk fallback |
| Canonical business records | Supabase/Postgres | Contract-defined JSONB hybrid (ADR-019), never fixed product tables |
| Semantic contracts (glossary included) | Supabase/Postgres, versioned documents | Server-authoritative atomic publish behind the `publish_contract` capability |
| Learned knowledge | Supabase/Postgres, gated rows | Typed slots (aliases, enum synonyms); propose/decide/revoke lifecycle (ADR-027) |
| Compiled workspace context | Control plane, per task | Contract + glossary + active learning rendered byte-stable into the runtime's cached prompt prefix |
| SaaS Control Plane | Node/TypeScript (Fastify) service | The only writer. Tenant routing, RBAC, proposals, publishing, learning gate, audit, connectors |
| MCP tool surface (internal) | Control plane, `/mcp` | The runtime's only reach into data; workspace-scoped bearer token per task (ADR-025) |
| Agent runtime | Hermes, pinned image, Dockerized | Adopted (ADR-006/026), stateless per task, no database credentials, swappable behind the adapter |
| Agent proposals, source messages, audit | Supabase/Postgres | Append-only audit through application flows; everything links back to its source |
| Documents | Customer Microsoft 365 | We store links/metadata, never copies, in v1 |
| SMS messages | App database + Twilio logs | Arrival trust: verified webhook + sender claim on the identity spine (M6) |
| Agent configuration | App database + baked runtime profile | SOUL/profile versioned in repo; per-workspace knowledge through the governed layer, never prompt edits |
| Integration logic | Control Plane | Twilio, later Graph; server-side only |
| Claude connector tools | Product-owned MCP server, external | Post-v1; intended to authorize through Supabase so it joins the identity spine |

## Build / Buy / Register

| Capability | V1 Action | Build / Buy / Register |
| --- | --- | --- |
| Excel task pane | Spike (M1), then build (M3/M4) | Build |
| Web admin/fallback UI | Build with Lovable + GitHub refinement | Build |
| Auth | Supabase broker; Entra as default IdP in the pane (Lane A), dialog relay fallback; identity linking in the schema | Build/configure |
| Contract-defined CRM database | Supabase/Postgres schema | Built |
| Knowledge layer (glossary, learning, prefix) | — | Built (ADR-027) |
| SaaS Control Plane | Node/TypeScript backend/API/worker | Built, extending |
| Agent Runtime Adapter + MCP tool surface | — | Built (ADR-025/026) |
| Hermes runtime | Pinned image, baked profile | Adopted; Juno deployment open (M5) |
| Workbook Contract Agent | Interview engine (M2), pane mount (M4) | Build |
| Supabase security baseline | RLS, isolation tests, purge, audit | Built, maintained |
| A2P 10DLC | Start during M1; gates M6 | Register (#24) |
| Minimal Entra app registration (sign-in only, no Graph) | M1, for the pane's Lane A silent sign-in | Register/configure |
| Publisher track (DUNS, Partner Center, verification) | Start during M1; gates nothing before the AppSource listing | Register (#53) |
| Microsoft Graph app permissions | Post-v1; staged minimal-scope ladder from zero | Defer |
| Microsoft Publisher Attestation | Post-v1 trust milestone | Attest later |
| SOC 2 | Design for readiness only | Prepare later |
| Claude connector | Post-v1 | Build later |

## V1 Feature Matrix

| Feature | V1 | Why |
| --- | --- | --- |
| Excel task pane: capture, review queue, proposal diffs | In (M3) | The primary surface; the demographic lives in Excel (ADR-028) |
| Excel task pane: authoring interview against the open workbook | In (M4) | The keystone onboarding moment (ADR-023) |
| Web admin: roles, audit, learning queue, settings | In (M3/M5) | The trust door; what the security packet points at |
| Web capture/review fallback | In | Platform-risk floor: capture never hits zero on a Microsoft bad day |
| Contract-defined business records | In (built) | Core substrate |
| Business glossary in the contract | In (built) | One knowledge artifact, one gate (ADR-027) |
| Governed learning (typed slots, gated) | In (built) | The agent gets smarter per workspace; every lesson inspectable and revocable |
| Compiled cached context prefix | In (built) | Measured: 2-3 calls/8-15s/~$0.03 per task, from 5/21s/$0.045 |
| Agent proposal review queue | In (built; pane UI M3) | Trust and control mechanism |
| Configurable confirmation (confirm-each / apply-then-report) | In (M7 completes it) | The original product motivation; weekly report is the safety net |
| Weekly change report | In (M7) | Load-bearing for apply-then-report |
| SMS capture, questions, reminders | In (M6) | First-class design-partner surface |
| Email forwarding ingestion | Out (post-v1) | Secondary channel; SMS + pane cover capture for the pilot |
| Workbook-to-contract ingestion | In (M2/M4) | The product thesis |
| Contract-generated constrained workbook + validate-at-sync | Out (post-v1, #29/#30) | The pane subsumes its interactive UX for the pilot (ADR-022 stands as the later shape) |
| Arbitrary bidirectional Excel sync | Out | Unchanged; never promised for v1 |
| OneDrive/SharePoint document links (pasted URLs) | In, links only | No Graph consent needed for pasted links |
| Full document ingestion/search | Out | Permissions, storage, privacy risk |
| Microsoft Graph data access (files, mail) | Out (post-v1 ladder) | The add-in needs zero Graph permissions; stage 0 is the v1 posture |
| Claude/MCP external connector | Out (post-v1) | After the API surface stabilizes |
| Outlook host for the pane | Out (candidate second host) | Decided in the ADR-028 follow-up |
| Client agent tuning (free-form prompt edits) | Out | Governed learning and contract changes are the tuning paths |
| Model/provider selection | Out | Claude-first behind the provider seam (ADR-013) |
| Self-hosting | Out | Portable containers, but not a v1 product |
| Relationships as first-class edges | Out (#20, backlog) | JSONB + contract relationships suffice at pilot scale |

## Proposal Warning Language

Use direct language around the risky promises:

"The pilot will not attempt fully autonomous CRM mutation or arbitrary bidirectional sync with any existing spreadsheet. Those are later-stage capabilities that require conflict handling, auditability, permissions, and operational support. V1 proves the agent-assisted update loop safely: extract, match, propose, approve (or apply-and-report), and audit. Where the agent acts without per-change approval, it does so under an opt-in mode with full audit and a weekly report, and high-risk actions always require explicit confirmation."
