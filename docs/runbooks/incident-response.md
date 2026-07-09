# Runbook: incident response

Internal. For a suspected security incident: credential exposure, cross-
tenant read, unauthorized write, agent misbehavior.

## Severity, fast

- **S1** — tenant data read or written across a boundary, or a write-capable
  credential exposed. Contain first, everything else later.
- **S2** — a credential of limited scope exposed (an agent token, an OAuth
  secret), or an authz bug found before exploitation.
- **S3** — a defect in a control with no evidence of impact.

## Contain

1. **Service-role key exposed:** rotate in the Supabase dashboard
   immediately, update Infisical, restart the control plane. Nothing else
   holds it; this closes the write plane.
2. **Agent token exposed:** revoke via the operator console (or
   `update agent_tokens set revoked_at = now() where id = ...`). Immediate
   effect, control-register row 6. Mint + bind a replacement via the seed
   scripts.
3. **A user account compromised:** in Supabase Auth, sign out all sessions
   for the user and reset credentials; check their role's blast radius in
   the members list.
4. **Agent misbehavior:** revoke its token (2). The agent cannot have
   written anything directly; check the proposal queue for pending garbage
   and the audit trail for what was approved.

## Assess

The audit trail is the assessment tool: `audit_events` is append-only with
actor, before/after, and source links. For a suspected cross-tenant issue,
diff what the actor's memberships permit against what the trail shows.
Postgres logs on the managed project cover reads RLS refused.

## Record

Write a timeline note in `.jarvis/` (durable), file a tracker issue with the
control-register row(s) implicated, and update the register/known-gaps in
the same PR as the fix (ADR-0011). If tenant data was affected once there
are tenants, notification obligations are a business decision made with
counsel — this runbook's job is to make the timeline and blast radius
provable.
