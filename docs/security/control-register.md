# Control Register

The spine that keeps QA and compliance in sync. Every security claim a reviewer will ask about maps to an enforced control in code, a test that proves it, and a packet doc that summarizes it. If a claim is not in this table, the packet may not make it. If a row is `enforced` without a test, that is a QA gap, not a finished control.

This register is the source of truth for status. The packet docs describe controls in prose; this table says whether they are real.

## Status legend

- **enforced** — the control exists in code or configuration.
- **tested** — an automated test proves the control holds.
- **enforced+tested** — both, and the test runs in CI today.
- **tested-after-DB** — the test exists but needs local Supabase to run (Docker was down at authoring time); it runs in CI.
- **partial** — partially enforced with a named gap below.
- **pending:\<dep\>** — designed in the ADRs, not yet built, blocked on the named dependency.

## Register

| # | Claim | Enforced by | Test | Packet doc | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Tenant data is isolated by workspace | RLS + `workspace_id` on every tenant row ([0002_rls.sql](../../supabase/migrations/0002_rls.sql), [0001_init.sql](../../supabase/migrations/0001_init.sql)) | [tests/isolation.test.ts](../../tests/isolation.test.ts) | [tenant-isolation.md](tenant-isolation.md) | enforced; tested-after-DB |
| 2 | The control plane is the only writer | No user write policies; service role is server-only; runtime has no DB creds | isolation write-denied case | [tenant-isolation.md](tenant-isolation.md), [agent-runtime-security.md](agent-runtime-security.md) | enforced; tested-after-DB |
| 3 | The agent runtime cannot reach the database | Runtime gets no Supabase env ([docker/compose.yaml](../../docker/compose.yaml)); only the control plane holds the service key | compose review + #2 | [agent-runtime-security.md](agent-runtime-security.md) | enforced |
| 4 | The agent writes only agent-editable fields | `validateProposalAgainstContract` ([validate.ts](../../packages/contract/src/validate.ts)) | [validate.test.ts](../../packages/contract/src/validate.test.ts) | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 5 | Malformed runtime output is rejected, never written | adapter `callRuntime` ([adapter/runtime.ts](../../apps/api/src/adapter/runtime.ts)) | [runtime.test.ts](../../apps/api/src/adapter/runtime.test.ts) | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 6 | Sensitive field values never reach the model | `buildContextDisplay` ([redact.ts](../../packages/contract/src/redact.ts)) used in [repo.ts](../../apps/api/src/repo.ts) | [redact.test.ts](../../packages/contract/src/redact.test.ts) | [ai-data-handling.md](ai-data-handling.md), [data-classification-and-handling.md](data-classification-and-handling.md) | enforced+tested |
| 7 | Writes are auditable, before/after + source link | [apply.ts](../../apps/api/src/pipeline/apply.ts) writes an audit event per change | tests/pipeline-integration.test.ts | [audit-logging.md](audit-logging.md) | enforced; tested-after-DB |
| 8 | Audit is append-only | `prevent_mutation` trigger ([0001_init.sql](../../supabase/migrations/0001_init.sql)) | isolation append-only case | [audit-logging.md](audit-logging.md) | enforced; tested-after-DB |
| 9 | Identity verified on every protected endpoint | `authenticate` verifies the Supabase JWT ([auth.ts](../../apps/api/src/auth.ts)) | tests/rbac-matrix.test.ts | [auth-rbac.md](auth-rbac.md) | enforced; tested-after-DB (HS256 caveat, see gaps) |
| 10 | Authorization (RBAC) on every protected endpoint | `requireCapability` + capability map ([auth.ts](../../apps/api/src/auth.ts), [shared](../../packages/shared/src/index.ts)) | tests/rbac-matrix.test.ts | [auth-rbac.md](auth-rbac.md) | enforced; tested-after-DB |
| 11 | RLS is enabled on every tenant table | migrations + CI lint | CI rls-enabled check ([ci.yml](../../.github/workflows/ci.yml)) | [tenant-isolation.md](tenant-isolation.md) | enforced; lint added |
| 12 | Secrets are not in source or shipped to the browser | env config, [.gitignore](../../.gitignore), [.env.example](../../.env.example) | CI secret-scan check | [secrets-management.md](secrets-management.md) | partial |
| 13 | Sensitive values are masked in logs | `redactSensitive` helper ([redact.ts](../../packages/contract/src/redact.ts)) | [redact.test.ts](../../packages/contract/src/redact.test.ts) | [secrets-management.md](secrets-management.md) | partial (helper exists; not yet applied at every log site) |
| 14 | BYOK keys are encrypted, never logged, rotatable | — | — | [secrets-management.md](secrets-management.md), [ai-data-handling.md](ai-data-handling.md) | pending: billing connector (ADR-013) |
| 15 | Microsoft Graph permissions are least-privilege | — | — | [microsoft-permissions.md](microsoft-permissions.md) | pending: Graph connector (ADR-012) |
| 16 | SMS has consent and opt-out | — | — | [sms-compliance.md](sms-compliance.md) | pending: SMS surface + A2P (ADR-010) |
| 17 | Backups exist and restore is tested | Supabase backups (managed) | restore drill | [backup-restore.md](backup-restore.md) | pending: tested drill |
| 18 | Platform responsibilities are split and evidenced | — | — | [platform-hosting.md](platform-hosting.md) | pending: Juno (ADR-017) |

## Known control gaps (weaken specific claims until fixed)

These come from the skeleton handoff (commit `b918bda`). They are listed here, not hidden, because they undermine claims above.

- **Workspace deletion is blocked by the append-only trigger.** `audit_events` cascades on workspace delete, but the `before delete` trigger raises on any delete, so the cascade aborts. This breaks deletion and offboarding (affects [data-retention-deletion.md](data-retention-deletion.md)). Needs a deliberate deletion path (soft-delete or a SECURITY DEFINER purge the trigger exempts).
- **Apply is not atomic.** Claim #7 is weaker than it reads: record write, audit insert, and proposal-status flip are separate calls, so a mid-way failure can leave a write without its audit row or a half-applied multi-change proposal. Move apply into a Postgres function (RPC) so write-and-audit is one transaction. Until then, mark #7 `partial` in practice.
- **JWT verification assumes HS256 + shared secret.** Claim #9 holds for local Supabase; a production project signing asymmetrically (JWKS) would not verify. Needs the `createRemoteJWKSet` path plus `aud`/`iss` checks.

## How to use this register

- Adding a control: add a row before writing the packet prose, so the doc can point back here.
- Changing status to `enforced`: a test must exist (cite it) or the row stays `partial`.
- Reviewing the packet: no doc should claim a control this register does not back at the stated status.
