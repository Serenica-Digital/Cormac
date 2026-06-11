# Control Register

The spine that keeps QA and compliance in sync. Every security claim a reviewer will ask about maps to an enforced control in code, a test that proves it, and a packet doc that summarizes it. If a claim is not in this table, the packet may not make it. If a row is `enforced` without a test, that is a QA gap, not a finished control.

This register is the source of truth for status. The packet docs describe controls in prose; this table says whether they are real.

## Status legend

- **enforced** — the control exists in code or configuration.
- **tested** — an automated test proves the control holds.
- **enforced+tested** — both, and the test runs in CI today.
- **partial** — partially enforced with a named gap below.
- **pending:\<dep\>** — designed in the ADRs, not yet built, blocked on the named dependency.

## Register

| # | Claim | Enforced by | Test | Packet doc | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Tenant data is isolated by workspace | RLS + `workspace_id` on every tenant row ([0002_rls.sql](../../supabase/migrations/0002_rls.sql), [0001_init.sql](../../supabase/migrations/0001_init.sql)) | [tests/isolation.test.ts](../../tests/isolation.test.ts) | [tenant-isolation.md](tenant-isolation.md) | enforced+tested |
| 2 | The control plane is the only writer | No user write policies; service role is server-only; runtime has no DB creds | isolation write-denied case | [tenant-isolation.md](tenant-isolation.md), [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 3 | The agent runtime cannot reach the database | Runtime gets no Supabase env ([docker/compose.yaml](../../docker/compose.yaml)); only the control plane holds the service key | compose review + #2 | [agent-runtime-security.md](agent-runtime-security.md) | enforced |
| 4 | The agent writes only agent-editable fields | `validateProposalAgainstContract` ([validate.ts](../../packages/contract/src/validate.ts)) | [validate.test.ts](../../packages/contract/src/validate.test.ts) | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 5 | Malformed runtime output is rejected, never written | adapter `callRuntime` ([adapter/runtime.ts](../../apps/api/src/adapter/runtime.ts)) | [runtime.test.ts](../../apps/api/src/adapter/runtime.test.ts) | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 6 | Sensitive field values never reach the model | `buildContextDisplay` ([redact.ts](../../packages/contract/src/redact.ts)) used in [repo.ts](../../apps/api/src/repo.ts) | [redact.test.ts](../../packages/contract/src/redact.test.ts) | [ai-data-handling.md](ai-data-handling.md), [data-classification-and-handling.md](data-classification-and-handling.md) | enforced+tested |
| 7 | Writes are auditable, before/after + source link, atomically | [apply.ts](../../apps/api/src/pipeline/apply.ts) applies via the `apply_proposal` Postgres function: record write + audit + status flip are one transaction ([0003](../../supabase/migrations/0003_apply_proposal_fn.sql)) | tests/pipeline-integration.test.ts, tests/atomic-apply.test.ts | [audit-logging.md](audit-logging.md) | enforced+tested |
| 8 | Audit is append-only | `prevent_mutation` trigger ([0001_init.sql](../../supabase/migrations/0001_init.sql)) | isolation append-only case | [audit-logging.md](audit-logging.md) | enforced+tested |
| 9 | Identity verified on every protected endpoint | `authenticate` verifies the token against the Supabase JWKS, enforcing the issuer ([auth.ts](../../apps/api/src/auth.ts), ADR-020) | tests/rbac-matrix.test.ts | [auth-rbac.md](auth-rbac.md) | enforced+tested |
| 10 | Authorization (RBAC) on every protected endpoint | `requireCapability` + capability map ([auth.ts](../../apps/api/src/auth.ts), [shared](../../packages/shared/src/index.ts)) | tests/rbac-matrix.test.ts | [auth-rbac.md](auth-rbac.md) | enforced+tested |
| 11 | RLS is enabled on every tenant table | migrations + CI lint | CI rls-enabled check ([ci.yml](../../.github/workflows/ci.yml)) | [tenant-isolation.md](tenant-isolation.md) | enforced; lint added |
| 12 | Secrets are not in source or shipped to the browser | env config, [.gitignore](../../.gitignore), [.env.example](../../.env.example) | CI secret-scan check | [secrets-management.md](secrets-management.md) | partial (scan covers tracked .env, PEM keys, service-role-in-web; provider key patterns being widened) |
| 13 | Sensitive values are masked in logs | `redactSensitive` helper ([redact.ts](../../packages/contract/src/redact.ts)) | [redact.test.ts](../../packages/contract/src/redact.test.ts) | [secrets-management.md](secrets-management.md) | partial (helper applied at zero log sites; logging is HTTP-only today so no record values are logged, but nothing enforces that — #41) |
| 14 | BYOK keys are encrypted, never logged, rotatable | — | — | [secrets-management.md](secrets-management.md), [ai-data-handling.md](ai-data-handling.md) | pending: billing connector (ADR-013) |
| 15 | Microsoft Graph permissions are least-privilege | — | — | [microsoft-permissions.md](microsoft-permissions.md) | pending: Graph connector (ADR-012) |
| 16 | SMS has consent and opt-out | — | — | [sms-compliance.md](sms-compliance.md) | pending: SMS surface + A2P (ADR-010) |
| 17 | Backups exist and restore is tested | Supabase backups (managed) | restore drill | [backup-restore.md](backup-restore.md) | pending: tested drill |
| 18 | Platform responsibilities are split and evidenced | — | — | [platform-hosting.md](platform-hosting.md) | pending: Juno (ADR-017) |
| 19 | The runtime's tool surface is authenticated and tenant-bound | `/mcp` bearer token compared timing-safe (`timingSafeEqual`), bound to one workspace ([mcp/routes.ts](../../apps/api/src/mcp/routes.ts), ADR-025/026) | [tests/mcp-tools.test.ts](../../tests/mcp-tools.test.ts) (missing/wrong token rejected) | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 20 | Runtime tools are workspace-scoped and allowlisted | Every MCP tool query filters `workspace_id`; the profile allowlist serves exactly the four operations-agent tools ([mcp/server.ts](../../apps/api/src/mcp/server.ts), [config.yaml](../../docker/hermes-runtime/config.yaml)) | mcp-tools tool-list and redaction cases | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 21 | The agent's only write path is a gated proposal tool | `submit_proposal` validates shape (Zod) and contract (agent-editable fields), holds `pending` only, one per source message (migration 0004); applies only via the human decision pipeline | mcp-tools write-gate, duplicate, and unknown-task cases | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 22 | The runtime cannot execute terminal commands | Tool allowlist excludes `terminal`; `pre_tool_call` deny hook vetoes it as a second layer ([deny-terminal.sh](../../docker/hermes-runtime/agent-hooks/deny-terminal.sh)) | manual: ADR-026 spike (live veto observed); CI test filed (#44) | [agent-runtime-security.md](agent-runtime-security.md) | enforced (manual evidence) |
| 23 | Workspace deletion is a deliberate, service-role-only path | `purge_workspace` SECURITY DEFINER fn; transaction-local flag is the only thing the append-only trigger honors, DELETEs only ([0005](../../supabase/migrations/0005_workspace_purge.sql)) | [tests/workspace-purge.test.ts](../../tests/workspace-purge.test.ts) | [data-retention-deletion.md](data-retention-deletion.md) | enforced+tested |

## Known control gaps (weaken specific claims until fixed)

From the skeleton handoff and the 2026-06-10 audit pass, listed here rather than hidden because they qualify claims above. Two earlier gaps are now closed: the JWT-HS256 gap by ADR-020 (JWKS), and the non-atomic apply by migration 0003 (the `apply_proposal` transaction, proven by `tests/atomic-apply.test.ts`).

- **The agent's own actions write no audit events.** `actor_type='agent'` exists in the schema and is never used; proposal submission is invisible in the audit log (#42). Weakens the audit-completeness reading of row 7 until fixed.

Closed 2026-06-10 (PR #45): workspace deletion (now row 23), CORS allow-all (allowlist, `CORS_ORIGINS`), JWT audience (aud=authenticated enforced), and error-detail leakage (5xx detail logged server-side only). Each closure cites its test in the PR.

## How to use this register

- Adding a control: add a row before writing the packet prose, so the doc can point back here.
- Changing status to `enforced`: a test must exist (cite it) or the row stays `partial`.
- Reviewing the packet: no doc should claim a control this register does not back at the stated status.
