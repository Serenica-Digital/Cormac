# Control Register

The spine that keeps QA and compliance in sync. Every security claim a reviewer will ask about maps to an enforced control in code, a test that proves it, and a packet doc that summarizes it. If a claim is not in this table, the packet may not make it. If a row is `enforced` without a test, that is a QA gap, not a finished control.

This register is the source of truth for status. The packet docs describe controls in prose; this table says whether they are real. A static guard ([scripts/check-control-register.ts](../../scripts/check-control-register.ts), CI step `check:controls`) parses this table and fails the build if a cited test is missing, a `tested` row cites none, or a repo test is neither cited here nor exempted. See [How to use this register](#how-to-use-this-register) for the citation convention and the exemption policy the guard enforces.

## Status legend

- **enforced** — the control exists in code or configuration.
- **tested** — an automated test proves the control holds.
- **enforced+tested** — both, and the test runs in CI today.
- **partial** — partially enforced with a named gap below.
- **pending:\<dep\>** — designed in the ADRs, not yet built, blocked on the named dependency.

The `Test` column cites test files as backticked paths ending `.test.ts`, comma-separated; non-file evidence (a config review, a CI lint, manual evidence) is written as plain prose with no path. Every `tested` / `enforced+tested` row cites at least one existing test file.

## Register

| # | Claim | Enforced by | Test | Packet doc | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Tenant data is isolated by workspace | RLS + `workspace_id` on every tenant row ([0002_rls.sql](../../supabase/migrations/0002_rls.sql), [0001_init.sql](../../supabase/migrations/0001_init.sql)) | `tests/integration/isolation.test.ts` | [tenant-isolation.md](tenant-isolation.md) | enforced+tested |
| 2 | The control plane is the only writer | No user write policies; service role is server-only; runtime has no DB creds | `tests/integration/isolation.test.ts` (write-denied case) | [tenant-isolation.md](tenant-isolation.md), [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 3 | The agent runtime cannot reach the database | Runtime gets no Supabase env ([docker/compose.yaml](../../docker/compose.yaml)); only the control plane holds the service key | compose review; see row 2 | [agent-runtime-security.md](agent-runtime-security.md) | enforced |
| 4 | The agent writes only agent-editable fields | `validateProposalAgainstContract` ([validate.ts](../../packages/contract/src/validate.ts)) | `tests/unit/validate.test.ts` | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 5 | Malformed runtime output is rejected, never written | adapter `callRuntime` ([adapter/runtime.ts](../../apps/api/src/adapter/runtime.ts)) | `tests/unit/runtime.test.ts` | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 6 | Sensitive field values never reach the model | `buildContextDisplay` ([redact.ts](../../packages/contract/src/redact.ts)) used in [repo.ts](../../apps/api/src/repo.ts); the compiled prefix renders redacted views only | `tests/unit/redact.test.ts`, `tests/integration/context-compile.test.ts` | [ai-data-handling.md](ai-data-handling.md), [data-classification-and-handling.md](data-classification-and-handling.md) | enforced+tested |
| 7 | Writes are auditable, before/after + source link, atomically | [apply.ts](../../apps/api/src/pipeline/apply.ts) applies via the `apply_proposal` Postgres function: record write + audit + status flip are one transaction ([0003](../../supabase/migrations/0003_apply_proposal_fn.sql)) | `tests/integration/pipeline-integration.test.ts`, `tests/integration/atomic-apply.test.ts` | [audit-logging.md](audit-logging.md) | enforced+tested |
| 8 | Audit is append-only | `prevent_mutation` trigger ([0001_init.sql](../../supabase/migrations/0001_init.sql)) | `tests/integration/isolation.test.ts` (append-only case) | [audit-logging.md](audit-logging.md) | enforced+tested |
| 9 | Identity verified on every protected endpoint | `authenticate` verifies the token against the Supabase JWKS, enforcing the issuer and `aud=authenticated` ([auth.ts](../../apps/api/src/auth.ts), ADR-020) | `tests/integration/rbac-matrix.test.ts`, `tests/unit/server.test.ts` (audience case) | [auth-rbac.md](auth-rbac.md) | enforced+tested (HS256 path; see gap below) |
| 10 | Authorization (RBAC) on every protected endpoint | `requireCapability` + capability map ([auth.ts](../../apps/api/src/auth.ts), [shared](../../packages/shared/src/index.ts)) | `tests/integration/rbac-matrix.test.ts` | [auth-rbac.md](auth-rbac.md) | enforced+tested |
| 11 | RLS is enabled on every tenant table | migrations + CI lint | CI `check:rls` lint ([scripts/check-rls.ts](../../scripts/check-rls.ts)) | [tenant-isolation.md](tenant-isolation.md) | enforced; lint added |
| 12 | Secrets are not in source or shipped to the browser | env config, [.gitignore](../../.gitignore), [.env.example](../../.env.example) | CI `check:secrets` lint | [secrets-management.md](secrets-management.md) | partial (scan covers tracked .env, PEM keys, service-role-in-web; provider key patterns being widened) |
| 13 | Sensitive values are masked in logs | `redactSensitive` helper ([redact.ts](../../packages/contract/src/redact.ts)) | `tests/unit/redact.test.ts` | [secrets-management.md](secrets-management.md) | partial (helper applied at zero log sites; logging is HTTP-only today so no record values are logged, but nothing enforces that — #41) |
| 14 | BYOK keys are encrypted, never logged, rotatable | — | — | [secrets-management.md](secrets-management.md), [ai-data-handling.md](ai-data-handling.md) | pending: billing connector (ADR-013) |
| 15 | Microsoft Graph permissions are least-privilege | — | — | [microsoft-permissions.md](microsoft-permissions.md) | pending: Graph connector (ADR-012) |
| 16 | SMS has consent and opt-out | — | — | [sms-compliance.md](sms-compliance.md) | pending: SMS surface + A2P (ADR-010) |
| 17 | Backups exist and restore is tested | Supabase backups (managed) | restore drill (manual, not yet run) | [backup-restore.md](backup-restore.md) | pending: tested drill |
| 18 | Platform responsibilities are split and evidenced | — | — | [platform-hosting.md](platform-hosting.md) | pending: Juno (ADR-017) |
| 19 | The runtime's tool surface is authenticated and tenant-bound | `/mcp` bearer token compared timing-safe (`timingSafeEqual`), bound to one workspace ([mcp/routes.ts](../../apps/api/src/mcp/routes.ts), ADR-025/026) | `tests/integration/mcp-tools.test.ts` | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 20 | Runtime tools are workspace-scoped and allowlisted | Every MCP tool query filters `workspace_id`; the profile allowlist serves exactly the four operations-agent tools ([mcp/server.ts](../../apps/api/src/mcp/server.ts), [config.yaml](../../docker/hermes-runtime/config.yaml)) | `tests/integration/mcp-tools.test.ts` | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 21 | The agent's only write path is a gated proposal tool | `submit_proposal` validates shape (Zod) and contract (agent-editable fields), holds `pending` only, one per source message (migration 0004); applies only via the human decision pipeline | `tests/integration/mcp-tools.test.ts` | [agent-runtime-security.md](agent-runtime-security.md) | enforced+tested |
| 22 | The runtime cannot execute terminal commands | Tool allowlist excludes `terminal`; `pre_tool_call` deny hook vetoes it as a second layer ([deny-terminal.sh](../../docker/hermes-runtime/agent-hooks/deny-terminal.sh)) | manual: ADR-026 spike (live veto observed); CI test filed (#44) | [agent-runtime-security.md](agent-runtime-security.md) | enforced (manual evidence) |
| 23 | Workspace deletion is a deliberate, service-role-only path | `purge_workspace` SECURITY DEFINER fn; transaction-local flag is the only thing the append-only trigger honors, DELETEs only ([0005](../../supabase/migrations/0005_workspace_purge.sql)) | `tests/integration/workspace-purge.test.ts` | [data-retention-deletion.md](data-retention-deletion.md) | enforced+tested |
| 24 | Contract changes pass a server-authoritative, atomic, audited publish gate | `publish_contract` SECURITY DEFINER fn ([0007](../../supabase/migrations/0007_workspace_knowledge.sql)) bumps the version, flips the single active flag, and audits before/after in one transaction; [pipeline/contract.ts](../../apps/api/src/pipeline/contract.ts) refuses an invalid document at the route and a direct RPC call by an authenticated user | `tests/integration/contract-publish.test.ts` | [auth-rbac.md](auth-rbac.md), [audit-logging.md](audit-logging.md) | enforced+tested |
| 25 | Learned knowledge is gated: nothing reaches the agent without human approval | `decide_learning` ([0007](../../supabase/migrations/0007_workspace_knowledge.sql)) flips status + audits atomically; a proposed item is invisible to the compiled prefix, revoke reopens the dedup slot, and an item gone stale against the active contract is refused at approval; propose-time payloads validate against the contract ([pipeline/learning.ts](../../apps/api/src/pipeline/learning.ts), [learning.ts](../../packages/contract/src/learning.ts)) | `tests/integration/learning-lifecycle.test.ts`, `tests/unit/learning.test.ts` | [ai-data-handling.md](ai-data-handling.md) | enforced+tested |
| 26 | The agent's per-task context is control-plane-compiled; only approved knowledge reaches it | `compileWorkspaceContext` ([pipeline/context.ts](../../apps/api/src/pipeline/context.ts)) renders the active contract + only `active` learned rows, resolves aliases to live records (archived → nothing), excludes proposed items, and is byte-stable | `tests/integration/context-compile.test.ts` | [ai-data-handling.md](ai-data-handling.md) | enforced+tested |
| 27 | The SSE capture surface enforces the same authz chain as `/capture` and never leaks error detail | `registerCaptureStreamRoute` reuses the `authenticate` + `requireCapability('capture_update')` preHandler and validates input before `reply.hijack()`; 401/403/400 land before the stream opens; `safeErrorPayload` scrubs error frames ([routes/capture-stream.ts](../../apps/api/src/routes/capture-stream.ts)) | `tests/unit/capture-stream.test.ts`, `tests/integration/sse-stream-integration.test.ts` | [agent-runtime-security.md](agent-runtime-security.md), [pane-feature-review.md](pane-feature-review.md) | enforced+tested |
| 28 | API responses do not leak internals: CORS is an allowlist and 5xx detail is withheld | CORS bound to `CORS_ORIGINS` (no `origin: true`); the central error handler logs 5xx detail server-side and returns code+message only, passing 4xx detail through ([server.ts](../../apps/api/src/server.ts)); the hijacked SSE path mirrors this via `safeErrorPayload` | `tests/unit/server.test.ts`, `tests/unit/capture-stream.test.ts` | [architecture-and-trust-boundaries.md](architecture-and-trust-boundaries.md), [secrets-management.md](secrets-management.md) | enforced+tested |

## Known control gaps (weaken specific claims until fixed)

From the skeleton handoff and the 2026-06-10 audit pass, listed here rather than hidden because they qualify claims above. Two earlier gaps are now closed: the JWT-HS256 gap by ADR-020 (JWKS), and the non-atomic apply by migration 0003 (the `apply_proposal` transaction, proven by `tests/integration/atomic-apply.test.ts`).

- **The agent's own actions write no audit events.** `actor_type='agent'` exists in the schema and is never used; proposal submission is invisible in the audit log (#42). Weakens the audit-completeness reading of row 7 until fixed.
- **CI exercises only the HS256 token path, not production ES256/JWKS.** Local Supabase signs HS256 against `SUPABASE_JWT_SECRET`, and the test harness mints HS256 tokens, so the `aud`/issuer checks in row 9 are proven on the HS256 branch only. Production verifies ES256 against the published JWKS (ADR-020); that branch is verified manually (deployment-setup.md, the 2026-06-10 hosted run), not in CI. The guard cannot catch this class of gap (see [How to use this register](#how-to-use-this-register)); it is recorded here so row 9's green is read honestly.

Closed 2026-06-10 (PR #45): workspace deletion (now row 23), CORS allow-all (allowlist, `CORS_ORIGINS`, now row 28), JWT audience (aud=authenticated enforced, row 9), and error-detail leakage (5xx detail logged server-side only, now row 28). Each closure cites its test in the PR.

## How to use this register

- **Adding a control:** add a row before writing the packet prose, so the doc can point back here.
- **Changing status to `enforced+tested`:** cite at least one backticked test path that exists, or the row stays `enforced` / `partial`.
- **Reviewing the packet:** no doc should claim a control this register does not back at the stated status.
- **Citation convention (the guard parses this):** test files are backticked paths ending `.test.ts`, comma-separated. Non-file evidence is plain prose with no path. The guard errors on any path-shaped token that is not backticked and on any cited file that does not exist — it never silently skips.

### The exemption policy (what the guard allows out of the register)

Every `*.test.ts` in the repo must be cited by a row **or** listed in the guard's `QA_EXEMPT` allowlist with a reason. The allowlist is policed by one rule, so it does not become the loophole that defeats the guard:

> An exemption is only for a test that asserts **correctness of non-compliance logic** — a byte-stable renderer, a pure classifier, a test-only stub fixture. Any test that touches **auth, tenant isolation, audit, the write gate, or redaction** must have a register row. Never an exemption.

An exemption reason must say why the test is correctness-only **and** point to where the real control is rowed (e.g. "pane lane UX; server-side identity/authz is rows 9, 10, 27").

### What the guard does NOT prove

The guard checks existence, citation, and no-orphans. It does **not** prove a cited test actually exercises the claimed control (miscitation is a review responsibility), and it does **not** prove production-path coverage (see the HS256-vs-ES256 gap above). It stops the register from silently drifting out of sync with the test tree; it does not certify coverage depth. Read green here as "the chain is wired," not "the control is fully proven" — consistent with the project's skepticism toward green checkmarks.
