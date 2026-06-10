# Serenica CRM Agent

Serenica CRM Agent is a multi-tenant, contract-first CRM agent platform. Clients bring the spreadsheets their business already runs on. The system lifts each workbook into a governed, versioned semantic contract and operates on it through an agent reachable over web, SMS, email, Excel, and Claude/MCP. The generalizable product is the build. The first design partner is a small real-estate firm.

Status: early build. The walking skeleton runs end to end against real Postgres and the runtime seam is committed (ADR-021). Real Hermes integration and the Juno deployment are the open fronts. ADR-018 records the repository shape.

At the start of a fresh session, run `/onboard` (defined in [.claude/commands/onboard.md](.claude/commands/onboard.md)). It walks the decision record, the PRD, and the current build state, then reports back before any work starts.

## Where knowledge lives (the docs/ brain)

- [docs/adr/](docs/adr/): decisions and the reasoning behind them. Why we chose what we chose. Read these first; everything else dereferences them.
- [docs/prd/](docs/prd/): the official "what we're building" shape.
- [docs/research/](docs/research/): targeted external research, summarized with how it applies to us.
- [docs/security/](docs/security/): the compliance handbook we ship to clients so the product survives an IT review.
- [docs/notes/](docs/notes/): private developer space. Gitignored. Founding transcripts and the old proposal live here.

When a decision changes, write a new ADR and mark the old one superseded. Do not edit a settled decision out of the record.

## Vocabulary (use these exactly)

- **Serenica CRM Agent**: the product. Serenica is the company.
- **the control plane**: our Node/TypeScript backend trust layer. It owns tenant routing, RBAC, contract publishing, the proposal/confirmation/audit pipeline, connector webhooks, and every write. It is the only thing that writes business records.
- **Hermes / the agent runtime**: NousResearch Hermes Agent, the adopted execution runtime for the product (ADR-006). "Hermes" names only that upstream runtime and its tenant-facing product use. Never call the control plane Hermes.
- **Jarvis**: a Hermes instance configured as a development assistant, used while building Serenica (it reads the repo and docs and helps with code, planning, and Git). Jarvis is developer tooling, never a product component, and it never touches client data. Same upstream software as the Hermes product runtime, different name, different trust level (ADR-017).
- **Juno**: an external compute-orchestration platform (Orion, Helios, Terra) we are piloting as the prototype's deployment and development layer. It runs our containers. It does not own the product's authority, data, contracts, writes, or compliance, and every service stays portable so Juno is swappable (ADR-017).
- **the contract**: a client's published, versioned semantic contract: their objects, fields, identity rules, aliases, and Excel mappings. The shared source of truth.
- **surfaces**: web/PWA, SMS, email, Excel, Claude/MCP. Input and output doors. They never write directly.

## Invariants (do not violate without a new ADR)

- The control plane is the only writer. Surfaces and the runtime never mutate business records directly, and the runtime holds no database write credentials. Opt-in apply-then-report (fire-and-forget) is a control-plane policy, not a runtime capability.
- Contract-first. Business objects come from each workspace's published contract, not hard-coded tables. App-owned tables are operational only: workspaces, users, roles, source messages, proposals, audit events.
- One agent service, many doors. Every surface is an adapter over one command/proposal pipeline. MCP tools call our agent; they are never raw CRUD.
- The runtime runs stateless per task. Per-tenant learning lives as governed data in the control plane, never in runtime memory.
- Security evidence is a deliverable. Build so that [docs/security/](docs/security/) reads as a true summary of enforced controls.

## Working style

Write tight and declarative. No em-dashes. Avoid the "not X, but Y" reversal. No forced analogies. State what is true and what is open, and flag overstatements rather than smoothing them over. Honesty over polish.

## Branching and commits

- `dev` is the work trunk. Commit docs, PRD, config, and routine code straight to `dev`. No branch and no PR for everyday changes; do not stop to ask before an ordinary commit.
- `main` is the stable branch and stays the default. `dev` merges into `main` at milestone or release points through a PR, which is where CI and a review pass run.
- Behavior-changing or risky code (anything that could break the app or the trust boundary, such as a write path) takes a short-lived branch off `dev` and a PR back into `dev`.
- Keep commits scoped and messages declarative. Never sweep unrelated working-tree changes into a commit; commit only what the task touched.
