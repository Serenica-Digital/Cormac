# Runbook: workspace offboarding

Internal. Removing a tenant deliberately, completely, and provably.

## Before

1. Confirm the request with the workspace owner in writing.
2. If the tenant wants their data, export it first: records, contract
   versions, and audit trail are all reachable via the API with an owner
   session (no export tooling exists yet; at prototype scale, service-role
   selects into JSON are acceptable — note what was exported and when).
3. Note the workspace id and member list (the operator console shows both).

## Offboard

1. **Revoke agent tokens** for the workspace (operator console). Do this
   first so no agent lane is live mid-purge.
2. **Purge:** `select purge_workspace('<workspace-id>');` with the service
   role. This is the single sanctioned deletion path (register row 19): the
   append-only audit trigger honors deletes only inside this function, and
   the cascade removes records, proposals, messages, snapshots, memberships,
   contract versions, and the audit trail.
3. **Auth identities:** memberships die with the workspace, but the auth
   users survive (they may belong to other workspaces). Delete users whose
   only membership was this workspace via the Supabase admin API.
4. **Secrets:** if any Infisical slots were tenant-specific, clear them.

## Prove

- The workspace id no longer resolves: operator detail answers 404.
- A former member signing in sees no trace of the workspace.
- Record date, actor, and what was exported in `.jarvis/` and close the
  tracker issue.

Deliberately not automated: offboarding a tenant should cost a human a
checklist.
