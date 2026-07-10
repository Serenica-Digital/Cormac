# Control register

> **Status:** canonical · **Last reviewed:** 2026-07-09

The spine of this packet. Every security claim maps to an enforced control in
code, the test that proves it, and the packet doc that summarizes it. If a
claim is not in this table, the packet may not make it. Prose in the other
docs describes controls; this table says whether they are real.

A static guard ([scripts/check-control-register.ts](../../scripts/check-control-register.ts),
`pnpm check:controls`, run manually this round) parses this table and fails if
a cited test is missing, a Verified row cites none, or a repo test is neither
cited nor exempted.

## Status legend (used across the whole packet)

- **Verified** — enforced in code AND proven by a cited automated test.
- **Partial** — enforced (or partly enforced) with a named gap; manual or
  config-review evidence lands here by definition.
- **Planned** — designed or intended, not built. Never described in present
  tense elsewhere in the packet.

Test citations are backticked repo-relative paths ending `.test.ts`/`.test.tsx`,
comma-separated. Non-file evidence is plain prose with no path.

## Register

| # | Claim | Enforced by | Test | Packet doc | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Tenant data is isolated by workspace | RLS with `is_member()` on every tenant table; `workspace_id` on every tenant row ([0002_rls.sql](../../supabase/migrations/0002_rls.sql)) | `apps/control-plane/tests/isolation.test.ts` | [tenant-isolation.md](tenant-isolation.md) | Verified |
| 2 | The control plane is the only writer of business records | Zero authenticated write policies; the service-role key exists only in the control plane process | `apps/control-plane/tests/isolation.test.ts` | [tenant-isolation.md](tenant-isolation.md) | Verified |
| 3 | The agent runtime holds no database credentials | The gateway env carries an agent token only, never a Supabase key (ADR-0005/0008; hub profile review, hardened in PR #72) | config review, no automated env lint | [agent-security-and-ai-data-handling.md](agent-security-and-ai-data-handling.md) | Partial |
| 4 | Agent access is bound to one workspace by token, with no tenant id in transit | Token-hash lookup binds (workspace, agent kind); `/agent/*` paths carry no workspaceId | `apps/control-plane/tests/agent-tokens.test.ts`, `apps/control-plane/tests/workbook-read.test.ts` | [agent-security-and-ai-data-handling.md](agent-security-and-ai-data-handling.md) | Verified |
| 5 | Authoring and operations agents are privilege-split | Per-kind capability map: authoring cannot submit proposals, operations cannot publish contracts | `apps/control-plane/tests/agent-tokens.test.ts` | [agent-security-and-ai-data-handling.md](agent-security-and-ai-data-handling.md) | Verified |
| 6 | Agent tokens are hashed at rest and revocable; unknown and revoked tokens read identically | SHA-256 hash is the only stored form; revocation is immediate; both failure modes answer 401 | `apps/control-plane/tests/agent-tokens.test.ts`, `apps/control-plane/tests/operator.test.ts` | [agent-security-and-ai-data-handling.md](agent-security-and-ai-data-handling.md) | Verified |
| 7 | Token hashes never appear in any API response | Operator reads select every column except `token_hash`; responses regex-swept for 64-hex strings | `apps/control-plane/tests/operator.test.ts` | [identity-and-access.md](identity-and-access.md) | Verified |
| 8 | Identity is verified on every protected endpoint | JWT verification against issuer + `aud=authenticated`; ES256 via JWKS, the HS256 dev branch structurally refused outside dev | `apps/control-plane/tests/rbac-matrix.test.ts` | [identity-and-access.md](identity-and-access.md) | Verified (HS256 branch only in tests; see known gaps) |
| 9 | Authorization (role capabilities) is enforced on every protected endpoint | `requireCapability` + the `@cormac/authz` capability map, exhaustively matrixed | `apps/control-plane/tests/rbac-matrix.test.ts`, `apps/control-plane/tests/membership.test.ts` | [identity-and-access.md](identity-and-access.md) | Verified |
| 10 | Member management holds its invariants: the owner role moves only by an owner's hand, a workspace never drops to zero owners, no one changes their own role | Route-level checks in the members surface | `apps/control-plane/tests/membership.test.ts` | [identity-and-access.md](identity-and-access.md) | Verified |
| 11 | The platform-operator tier is separate: the flag never bypasses workspace authorization | `requirePlatformAdmin` gates `/api/operator/*` only; workspace guards never consult it | `apps/control-plane/tests/operator.test.ts` | [identity-and-access.md](identity-and-access.md) | Verified |
| 12 | The agent's only write path is a held proposal; only a human decision applies it | Proposal submission holds `pending`; the apply pipeline runs behind `approve_proposal` | `apps/control-plane/tests/pipeline-integration.test.ts`, `apps/control-plane/tests/rbac-matrix.test.ts` | [agent-security-and-ai-data-handling.md](agent-security-and-ai-data-handling.md) | Verified |
| 13 | Applying a proposal is atomic: record write, audit event, and status flip in one transaction | The `apply_proposal` Postgres function ([0003](../../supabase/migrations/0003_apply_proposal_fn.sql)) | `apps/control-plane/tests/atomic-apply.test.ts` | [audit-and-observability.md](audit-and-observability.md) | Verified |
| 14 | The audit trail is append-only | `prevent_mutation` trigger; only the sanctioned purge path may delete | `apps/control-plane/tests/isolation.test.ts` | [audit-and-observability.md](audit-and-observability.md) | Verified |
| 15 | Member, tenant, and token administration is audited with actor and before/after | `member_added` / `member_role_changed` / `member_removed` / `workspace_created` / `agent_token_revoked` audit events | `apps/control-plane/tests/membership.test.ts`, `apps/control-plane/tests/operator.test.ts` | [audit-and-observability.md](audit-and-observability.md) | Verified |
| 16 | Contract changes pass a server-authoritative, atomic, audited publish gate | The `publish_contract` function ([0006](../../supabase/migrations/0006_publish_contract_fn.sql)); invalid documents refused at the route and the agent submit gate | `apps/control-plane/tests/contract-publish-rpc.test.ts`, `apps/control-plane/tests/contract-submit.test.ts` | [identity-and-access.md](identity-and-access.md) | Verified |
| 17 | Sensitive field values never enter the model context | `buildContextDisplay` ([redact.ts](../../packages/contract/src/redact.ts)) on every agent-facing record read | `apps/control-plane/tests/redact.test.ts` | [agent-security-and-ai-data-handling.md](agent-security-and-ai-data-handling.md) | Verified |
| 18 | Sensitive values are masked in log-bound copies of record data | `redactSensitive` helper, tested; applied at zero log sites today (logging is HTTP-level only, so no record values are logged, but nothing enforces that) | `apps/control-plane/tests/redact.test.ts` | [data-handling.md](data-handling.md) | Partial |
| 19 | Workspace deletion is a deliberate, service-role-only path | `purge_workspace` SECURITY DEFINER ([0005](../../supabase/migrations/0005_workspace_purge.sql)); exercised as every integration suite's cleanup, no dedicated denial test | exercised incidentally by suite cleanup | [data-handling.md](data-handling.md) | Partial |
| 20 | Web read routes run the same identity + authorization chain as writes | Shared preHandlers on every read | `apps/control-plane/tests/web-read-routes.test.ts` | [identity-and-access.md](identity-and-access.md) | Verified |
| 21 | API responses do not leak internals: CORS is an allowlist and 5xx detail is withheld | `CORS_ORIGINS` allowlist (never `origin: true`); the error handler logs 5xx detail server-side and returns code+message only ([server.ts](../../apps/control-plane/src/server.ts)) | code review; no dedicated test in v2 | [architecture-and-trust-boundary.md](architecture-and-trust-boundary.md) | Partial |
| 22 | Secrets live in one authority (Infisical); no dotenv anywhere | All processes run under `infisical run`; config comes from process env only ([config.ts](../../apps/control-plane/src/config.ts)); no automated secret scan in v2 | posture review | [secrets-management.md](secrets-management.md) | Partial |
| 23 | Demo credentials cannot reach a non-local stack | `assertLocalDemoTarget` hard guard in the seed CLI; token binding refused outside the demo namespace | `apps/control-plane/tests/seed-demo.test.ts` (namespace token refusal; the URL guard itself is untested) | [secrets-management.md](secrets-management.md) | Partial |
| 24 | API rate limiting | Not built. Appears in the v0 architecture diagram; there is no rate limiting in v2 code | — | [known-gaps-and-roadmap.md](known-gaps-and-roadmap.md) | Planned |
| 25 | Backups exist and restore is drilled | Local stack is disposable; staging is managed Supabase (backup tier to confirm); no restore drill has been run | — | [known-gaps-and-roadmap.md](known-gaps-and-roadmap.md) | Planned |
| 26 | The workbook file itself never leaves the browser; the uploaded detection profile carries limited samples | `.xlsx` parsing is fully in-browser ([parse.ts](../../apps/web/src/workbook/parse.ts)); the detection profile uploads up to 3 sample values per column and 2 sample rows per sheet ([detect.ts](../../apps/web/src/workbook/detect.ts)); parsed grids persist unencrypted in browser localStorage ([store.ts](../../apps/web/src/workbook/store.ts)) | code review; detection correctness has a test but the boundary itself does not | [data-handling.md](data-handling.md) | Partial |
| 27 | The only unauthenticated endpoints are the health probes (`/health`, `/api/health`), which return static status and touch no data | The two probe routes return a constant body ([human.ts](../../apps/control-plane/src/routes/human.ts)); every other handler runs behind `authenticate` + a capability guard (rows 8-9) | `apps/control-plane/tests/health.test.ts` | [architecture-and-trust-boundary.md](architecture-and-trust-boundary.md) | Verified |

## How to use this register

- **Adding a control:** add the row before writing the packet prose, so the
  doc can point back here.
- **Marking a row Verified:** cite at least one backticked test path that
  exists, or the row stays Partial. The guard enforces this mechanically.
- **Reviewing the packet:** no doc may claim a control this register does not
  back at the stated status.
- **Changing a control:** update the row in the same PR (ADR-0011).

## What the guard does not prove

Existence, citation, and no-orphans only. It does not prove a cited test
exercises the claimed control (review's job), and it does not prove
production-path coverage: local tests mint HS256 tokens, while staging and
beyond verify ES256 against the JWKS. Read green as "the chain is wired",
not "the control is fully proven".
