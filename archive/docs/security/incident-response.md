# Incident Response

Status: drafted (baseline)
Maps to: operational policy
Last reviewed: 2026-06-06

A baseline policy for a small team running a private pilot. It scales up as the team and customer base grow; it is written now so the posture exists before real data does.

## Severity levels

- **SEV-1**: confirmed or suspected cross-tenant data exposure, credential compromise, or data loss. Immediate response.
- **SEV-2**: a security control is degraded (e.g., a write bypassing audit) without confirmed exposure. Same-day response.
- **SEV-3**: a vulnerability or misconfiguration with no active exploitation. Tracked and scheduled.

## Response steps

1. **Detect and declare.** Anyone can declare an incident. Record start time and a one-line summary.
2. **Contain.** Stop the bleeding: rotate the affected secret, disable the affected surface or workspace, or take the control plane offline if isolation is in doubt.
3. **Assess.** Determine scope using the audit trail (which workspaces, which records, which actor). The append-only audit is the primary forensic source.
4. **Notify.** Affected clients and any contractually-required parties, within the window the DPA/terms specify (pending the legal entity, ADR-001).
5. **Remediate.** Fix the root cause, add a control and a test so it cannot recur (update [control-register.md](control-register.md)).
6. **Postmortem.** Blameless write-up: timeline, root cause, what worked, what to change.

## Prerequisites to make this real

- A monitoring/alerting plan that surfaces auth failures, RLS violations, and permission denials (a hardening item; see [vulnerability-management.md](vulnerability-management.md)).
- Documented secret-rotation runbooks ([secrets-management.md](secrets-management.md)).
- A named owner and contact path, which depends on the entity question (ADR-001).
