# Architecture Decision Records

These records capture the significant decisions that set the shape of Serenica CRM Agent, and the reasoning behind each one. They are the most important documents in the repository, and they double as the project's brain and its history. The PRD says what we are building; the ADRs say why we are allowed to believe it. They are derived from the founding design conversations, preserved in the private development notes.

## How to use them

- Read ADRs in number order to see how the project's shape was reasoned into being.
- One decision per ADR. Keep them beefy. The context, the decision, the trade-offs, and the paths not taken all belong in the record, so a reader a year from now understands why things are the way they are without relitigating them.
- When a decision changes, write a new ADR and mark the old one superseded. Never edit a settled decision out of the record.

## Format

Each ADR opens with a header (Status, Date, Related), then runs:

- **Context**: the situation and the forces, including the journey that led here.
- **Decision**: what we chose, broken into parts where it helps.
- **Consequences**: what it commits us to, the follow-on work, and the risks we accept. Subsections are tailored to the decision (architectural, commercial, operational, and so on).
- **Alternatives considered**: each path we weighed and why it lost, with the evidence.
- **Open items**: the threads still unresolved.

The reasoning lives across Context, the decision rationale, and Alternatives. There is no separate "why" section, because the why is the whole document.

Status values: **Proposed**, **Accepted**, **Superseded by ADR-NNN**. `Planned` in the index means the decision is agreed and the record is queued to be written.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-generalizable-contract-first-platform.md) | Build a generalizable contract-first platform, not a bespoke CRM | Accepted | 2026-06-06 |
| [002](002-contract-first-data-model.md) | Contract-first data model: client spreadsheets define the business objects | Accepted | 2026-06-06 |
| [003](003-supabase-postgres-system-of-record.md) | Supabase/Postgres as the single system of record | Accepted | 2026-06-06 |
| [004](004-excel-as-contract-and-work-surface.md) | Excel is a contract and work surface, not the operational database | Accepted | 2026-06-06 |
| [005](005-control-plane-is-the-only-writer.md) | The control plane is the only writer | Accepted | 2026-06-06 |
| [006](006-adopt-hermes-as-agent-runtime.md) | Adopt Hermes as the agent runtime, behind a swappable adapter | Accepted | 2026-06-06 |
| [007](007-one-agent-service-many-doors.md) | One agent service, many doors (thick MCP, not raw CRUD) | Accepted | 2026-06-06 |
| [008](008-two-agent-roles.md) | Two agent roles: Workbook Contract Agent and CRM Operations Agent | Accepted | 2026-06-06 |
| [009](009-govern-learning-as-data.md) | Govern learning as data; the runtime stays stateless | Accepted | 2026-06-06 |
| [010](010-configurable-confirmation-model.md) | Configurable confirmation model; the weekly report as safety net | Accepted | 2026-06-06 |
| [011](011-auth-supabase-broker-control-plane-authorization.md) | Auth: Supabase broker, external providers, control-plane authorization | Accepted | 2026-06-06 |
| [012](012-microsoft-365-optional-tiered-connector.md) | Microsoft 365 as an optional tiered connector | Accepted | 2026-06-06 |
| [013](013-claude-first-provider-seam-billing-modes.md) | Claude-first provider seam; three billing modes; not BYO-AI | Accepted | 2026-06-06 |
| [014](014-lovable-ui-only-trust-server-side.md) | Lovable for the web UI only; trust enforced server-side | Accepted | 2026-06-06 |
| [015](015-security-packet-day-one-deliverable.md) | Security and compliance packet as a day-one deliverable | Accepted | 2026-06-06 |
| [016](016-market-posture-and-pricing-constraint.md) | Market posture and the pricing constraint | Accepted | 2026-06-06 |
| [017](017-juno-as-preferred-orchestration-platform.md) | Use Juno as the preferred orchestration platform for the prototype | Accepted as preferred direction | 2026-06-06 |
