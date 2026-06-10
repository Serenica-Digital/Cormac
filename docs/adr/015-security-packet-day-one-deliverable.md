# ADR-015: Security and compliance packet as a day-one deliverable

**Status:** Accepted
**Date:** 2026-06-06
**Related:** Makes the trust boundary of ADR-005 (the control plane is the only writer) and the runtime containment of ADR-006 evidenceable. It draws on ADR-011 (auth and RBAC), ADR-012 (least-privilege Graph), ADR-009 (auditable governed learning), and ADR-003 (RLS and backups); it now also needs a hosting section for the orchestration platform of ADR-017; and it is scoped by the market posture of ADR-016. The handbook itself lives in [docs/security/](../security/).

## Context

The product handles relationship, deal, and financial-adjacent data, and the targets will eventually face an IT or vendor-risk review. The trust-boundary design is enterprise-legible: surfaces untrusted, connectors verified at ingress, the control plane owning authority, the runtime unable to write, RLS as a backstop. But a design alone does not pass review. Reviewers ask for evidence, and the point of hardest scrutiny is agent-runtime containment, because the obvious question about an agent that proposes writes is how it is prevented from making them unsafely, especially when the runtime is a young, pre-1.0, single-tenant-by-design dependency (ADR-006).

The governing principle is the one stated during the design conversations: do not write a security packet that describes what you hope is true. Build the system so the packet is a readable summary of controls that are actually enforced. Security is also not only compliance here. The auditable timeline of source messages, approvals, schema changes, sync events, and agent-written updates is a core user-trust feature, and it is the safety net that makes the low-friction write loop tolerable (ADR-010).

## Decision

Treat the security and compliance packet as a first-class product deliverable, maintained in `docs/security/`, built so it summarizes enforced controls.

### 1. Every claim maps to an engineering requirement

| Security claim | Engineering requirement |
| --- | --- |
| Tenant data is isolated | RLS policies, a `workspace_id` on every tenant row, cross-tenant isolation tests |
| The agent cannot bypass approval | The runtime holds no database write credentials; only the control plane writes (ADR-005) |
| Writes are auditable | Append-only audit table with before-and-after values and source-message links |
| Graph permissions are least privilege | A permission inventory and a consent-scope review (ADR-012) |
| BYOK keys are protected | Encrypted secret storage, no key in logs, a rotation path (ADR-013) |
| AI calls are controlled | A documented prompt and data boundary and model-provider audit metadata |
| Sensitive fields are minimized to the model | The runtime context excludes fields the contract marks `sensitive`; logs mask them; the audit trail is intentionally not redacted (extends the per-field flags of ADR-002; [ai-data-handling.md](../security/ai-data-handling.md)) |

### 2. The packet contents

Privacy policy, terms, and DPA template; subprocessor list; data-flow and trust-boundary diagrams; auth and RBAC model; tenant-isolation model; audit-logging model; secrets management; backup and restore (tested); incident response; data retention and deletion; vulnerability and dependency management; Microsoft Graph permission inventory; SMS compliance; an AI data-handling statement; and a platform and hosting section that draws the shared-responsibility split between the orchestration platform and Serenica (what the platform controls and evidences versus what Serenica owns, ADR-017). The packet is written to be readable by a client, not only by us.

### 3. Agent-runtime isolation is a special workstream

This is the scary part, so it is called out explicitly: tenant-scoped config with no shared cross-tenant memory, no direct database write credentials, a per-tenant tool allowlist, runtime output validated by Zod and turned into proposals rather than writes, a pinned runtime version, container isolation, a documented fallback if the runtime is replaced, and logs scrubbed of secrets and customer data (ADR-006, ADR-009). The stateless-per-task and memory-off posture is itself a security control, not only a reliability one.

### 4. A feature security review per new surface

Before any connector or surface ships, answer: what data enters, who can trigger it, how identity is verified, which tenant it maps to, whether it can write, whether it creates a proposal or a direct mutation, what is logged, what secrets or tokens are involved, what third party receives data, and what happens on failure.

### 5. Day-one acceptance criteria, before real data enters

Every tenant table has workspace scoping and tested RLS, the control plane verifies the JWT and workspace role on every protected endpoint, the runtime has no Supabase write credentials, agent tool calls are allowlisted, the proposal-apply-audit flow works, secrets live outside code, backups are configured, basic incident-response and deletion policies exist, the subprocessor list is accurate, and the Microsoft, Twilio, and model data paths are documented.

### 6. SOC 2 is designed-for, not promised

Staged: a security baseline, then policies and evidence, then Type I when a buyer pushes, then Type II after an observation period. Tooling such as Vanta or Drata reduces evidence work but does not replace the architecture or an auditor. The market posture keeps the early customers below the regulated-compliance threshold (ADR-016), so a private-pilot packet plus implemented baseline controls is the bar, not certification.

## Consequences

- Security work is sequenced as part of the build, with owners and acceptance criteria, not as later cleanup, so the trust posture is real when the first real data enters.
- The same controls that pass an IT review are the user-trust features (auditable timeline, reversibility, the weekly report), so this workstream pays for itself twice.
- Some of these artifacts (a real entity for the DPA, a publisher domain for Microsoft verification) depend on the unresolved business-formation question in ADR-001, which is why that is the highest-ranked external risk.

## Alternatives considered

**Treat security as later cleanup.** Ship features, document controls afterward. Rejected because it produces bolt-on insecurity that fails review, and because tenant isolation and runtime containment have to be designed in, not retrofitted onto a running multi-tenant system.

**Pursue SOC 2 certification before the product exists.** Rejected as premature and expensive (a real five-figure-plus program with tooling and an auditor). A private pilot needs implemented baseline controls and a readable packet, with certification staged behind buyer demand.

## Open items

1. **Data scope in v1.** What client data is actually stored (contacts only, deal terms, financing details, documents), which sets the compliance bar and whether any regulated-data line is approached.
2. **Retention.** How long SMS and email source messages are kept, balancing provenance against minimization.
3. **Legal ownership.** Who owns the privacy policy, terms, and DPA, tied to the unresolved entity and partnership question (ADR-001).
4. **Report detail.** How much audit detail appears in client-facing weekly reports versus admin-only logs.
