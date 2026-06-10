# Security Packet

Status: first-class deliverable track
Last updated: June 6, 2026

This folder is the client-facing security-review evidence packet for the contract-first CRM agent platform. It is built alongside the product, not after it.

## The governing principle

Do not write a security packet that describes what we hope is true. Build the system so the packet is a readable summary of controls that are actually enforced (ADR-015).

## How this packet works: three layers, one chain

Security here is one chain repeated per claim: a claim a reviewer asks about maps to an **enforced control in code**, to a **test that proves it**, to a **packet doc that summarizes it** for the client.

- **[control-register.md](control-register.md)** is the spine and the source of truth for status. It lists every claim, what enforces it, the test that proves it, and an honest status. Read it first.
- **[qa-strategy.md](qa-strategy.md)** is the test layer: the taxonomy of tests, the agent eval harness, and the CI gates that keep controls from regressing.
- The packet documents below are the doc layer. Each carries a status header and points back to its register row. A doc never claims a control the register does not back.

The product is contract-first and data-agnostic: business objects come from each tenant's published contract, so sensitivity is a contract property (the per-field `sensitive` flag), not a fixed product data inventory. See [data-classification-and-handling.md](data-classification-and-handling.md). The market guardrail in ADR-016 (no formally-regulated buyers) keeps the bar at a private-pilot packet plus enforced baseline controls.

## Packet documents

Status reflects the register. `drafted` = written against real controls; `stub` = placeholder pending a dependency.

| Document | Status |
| --- | --- |
| [security-overview.md](security-overview.md) | drafted |
| [architecture-and-trust-boundaries.md](architecture-and-trust-boundaries.md) | drafted |
| [data-flow.md](data-flow.md) | drafted |
| [tenant-isolation.md](tenant-isolation.md) | drafted (tested) |
| [auth-rbac.md](auth-rbac.md) | drafted |
| [audit-logging.md](audit-logging.md) | drafted |
| [agent-runtime-security.md](agent-runtime-security.md) | drafted |
| [ai-data-handling.md](ai-data-handling.md) | drafted |
| [data-classification-and-handling.md](data-classification-and-handling.md) | drafted |
| [secrets-management.md](secrets-management.md) | drafted (partial) |
| [subprocessors.md](subprocessors.md) | drafted |
| [data-retention-deletion.md](data-retention-deletion.md) | drafted (open decisions) |
| [incident-response.md](incident-response.md) | drafted (baseline) |
| [vulnerability-management.md](vulnerability-management.md) | drafted |
| [backup-restore.md](backup-restore.md) | stub: tested drill |
| [platform-hosting.md](platform-hosting.md) | stub: Juno (ADR-017) |
| [microsoft-permissions.md](microsoft-permissions.md) | stub: Graph connector (ADR-012) |
| [sms-compliance.md](sms-compliance.md) | stub: SMS surface + A2P |
| [privacy-policy.md](privacy-policy.md), [terms.md](terms.md), [dpa.md](dpa.md) | stub: legal entity (ADR-001) |
| [security-questionnaire.md](security-questionnaire.md) | drafted (reusable template) |

## Day-one engineering controls

The first real-data pilot should not begin until these are implemented or explicitly risk-accepted. Current status is tracked as a gate in [qa-strategy.md](qa-strategy.md).

- Workspace/tenant scoping on all tenant data.
- Supabase RLS policies for tenant-scoped tables.
- Cross-tenant access tests for critical tables and APIs.
- The control plane verifies JWT/session and workspace role on protected endpoints.
- The agent runtime has no direct write credentials for canonical business records.
- Agent/runtime tools are allowlisted by tenant/workspace.
- Agent outputs are validated before becoming proposals or writes.
- Proposal, approval, apply, revert, and admin actions write audit events.
- Secrets are not stored in source code and are not logged.
- Backups are configured and at least one restore path is documented.
- Subprocessor list and AI data-handling statement are accurate for pilot review.
- Microsoft Graph permissions are documented before requesting consent.
- SMS consent/opt-out behavior is documented before production texting.

## Feature security review checklist

Use before adding a new surface, connector, or agent capability:

1. What data enters this feature?
2. Who or what can trigger it?
3. How is identity or provider authenticity verified?
4. How does the request map to a workspace and user?
5. Can it read data, propose writes, or apply writes?
6. Does every write route through proposal/confirmation/audit?
7. What gets logged, and what must not be logged?
8. What secrets, tokens, or API keys are involved?
9. Which third parties receive customer data?
10. What happens on failure, retry, or ambiguity?
