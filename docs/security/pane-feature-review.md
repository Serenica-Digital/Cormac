# Feature security review: Excel task pane and the SSE capture-stream route

> **Status:** drafted (M1 spike; re-confirm at M3 when the pane ships) · **Last reviewed:** 2026-06-13

REQ-061B requires a lightweight security review of every new surface, connector, or agent capability before its milestone build. M1 introduces two new entry points: the **Excel task pane** (a new client surface) and the **SSE capture-stream route** (a new authenticated control-plane endpoint). This applies the ten-question checklist from [README.md](README.md) to each. It covers the M1 spike as built; the pane's auth lanes and Office paths are not yet exercised in a real host (that is what the M1 probes measure), so this review is re-confirmed at M3 when the pane ships.

## A. SSE capture-stream route (`GET /api/workspaces/:workspaceId/capture/stream`)

Source: [apps/api/src/routes/capture-stream.ts](../../apps/api/src/routes/capture-stream.ts). Gated behind `SSE_PROBE_ENABLED` (off by default), so the route does not exist unless a deployment explicitly turns it on.

1. **What data enters?** A natural-language capture string (`text`) and the caller's Supabase session JWT. The text becomes a `source_message`, exactly as on `POST /capture`.
2. **Who/what can trigger it?** An authenticated workspace member, only when the probe flag is enabled. No anonymous or arrival-trust access.
3. **Identity verification?** The same `authenticate` preHandler as `POST /capture`: Supabase JWT verified against the JWKS (ES256) or the HS256 fallback, with issuer and `aud=authenticated` enforced (ADR-011, ADR-020). Verified end to end by the socket integration test (401 on a missing token).
4. **Workspace mapping?** `requireCapability('capture_update')` loads the membership row for `(workspaceId, authUserId)` and checks the capability before the handler runs. A non-member gets 403 before any stream byte (tested over a real socket).
5. **Read, propose, or apply?** Propose only. It reuses `captureUpdate` unmodified, which creates a held proposal; it never applies a write, and the runtime holds no database credentials (ADR-005).
6. **Every write through proposal/confirmation/audit?** Yes. The route produces a `source_message` and a held proposal; application stays on the separate, unchanged `decideProposal` path. No write shortcut is introduced.
7. **What is logged, and what must not be?** The route logs SSE event names, sequence, and timestamps. Error frames go through `safeErrorPayload`, which mirrors the #6 scrub (4xx detail passes, 5xx/raw is logged server-side and withheld from the client), proven by a test asserting a raw error message never reaches the client. **Known limitation:** `text` is a query parameter, so capture content appears in the request URL log. Acceptable for the gated spike (synthetic data); the M3 production stream should POST the text or redact the log (#41).
8. **Secrets/tokens involved?** Only the caller's session JWT (bearer header). The route holds no secrets and mints none.
9. **Third parties receiving data?** None beyond the existing capture path (the runtime calls Anthropic via Hermes, unchanged). No new subprocessor.
10. **Failure/retry/ambiguity?** A thrown error emits a scrubbed `error` frame then `done`. A deadline backstop (`RUNTIME_TIMEOUT_MS + 5000`) bounds a hung run. A client disconnect clears the deadline; the underlying run completes as on `POST /capture`, so the runtime's 10-concurrent-run cap (#51) still applies. Agent ambiguity routes to the normal decline/clarification path.

**Verdict:** the route adds no new trust surface beyond `POST /capture`; it shares the authz chain, the propose-only posture, and the audit path. The one residual is query-string logging, scoped to the spike and tracked for M3.

## B. Excel task pane (client surface)

Source: [apps/pane](../../apps/pane). A thin SPA we host, rendered in Excel's webview; Office.js bridges to the open document. Not yet executed in a real Office host (M1 probes measure that).

1. **What data enters?** The open workbook (read and highlight via Office.js), the user's capture text, and the user's Supabase session. No Microsoft Graph data (v1 is Graph stage zero; the add-in needs no Graph permissions).
2. **Who/what can trigger it?** A user who has installed the add-in and signed in via one of the three lanes.
3. **Identity verification?** A Supabase session, however minted: Lane 0 (`signInWithPassword`), Lane A (NAA id-token to `signInWithIdToken`), Lane B (Office dialog OAuth code flow). The control plane validates the resulting JWT regardless of lane. The identity-linking question (same `auth.users` row across lanes) is Probe B and decides ADR-032.
4. **Workspace mapping?** The pane resolves the user's workspace via `memberships` under RLS; every control-plane call carries the bearer token and is authorized server-side. The pane makes no authorization decision itself.
5. **Read, propose, or apply?** Read and relay only. The pane holds no business logic and no write authority. An approved write rendered back into the sheet via Office.js is a surface action on an already-audited decision, not a new writer (ADR-022, ADR-028).
6. **Every write through proposal/confirmation/audit?** Yes. All changes go through the control-plane pipeline; the pane never writes business records.
7. **What is logged, and what must not be?** The pane holds no secrets to leak. Session storage is partition-keyed by `Office.context.partitionKey`; the Lane B dialog keeps its PKCE verifier in its own origin storage and passes only the final tokens via `messageParent`, never through shared storage.
8. **Secrets/tokens involved?** Browser-public values only: the Supabase anon key (RLS enforces reach) and, for Lanes A/B, the public Entra client id. No server secret ever reaches the pane.
9. **Third parties receiving data?** Microsoft, for sign-in only on Lanes A/B (Entra, and the Microsoft login host for the dialog) and the Office.js CDN. No Graph data permission is requested (REQ-044: the Entra app is sign-in-only, `openid/profile/email`). The browser otherwise talks to our control plane and Supabase Auth.
10. **Failure/retry/ambiguity?** If Microsoft is unavailable, Lane 0 and the web fallback still work (the platform-risk floor, ADR-028). Lane failures are classified to a typed `FailureMode` and surfaced, never silent.

**Verdict:** the pane is a thin adapter consistent with ADR-007; trust stays server-side. The auth lanes and Office paths are unproven until the manual probes run, so this section is provisional pending M1 results and re-confirmed at the M3 build.

## Residual risks and follow-ups

- Query-string logging of capture content on the SSE route (spike-only; M3 fix, #41).
- The pane auth lanes and workbook paths are validated by typecheck/build and pure-logic unit tests only; real-host behavior is the M1 manual probes.
- Lane A's nonce/audience handling is a best-effort attempt at the unproven exchange; the classifiers will be tuned against real error strings during the probes.
- Re-confirm this review at M3 (auth lanes proven, production SSE route, any new Office.js tool-bridge verbs) and feed the add-in deployment and pane-sandbox posture into the security packet (ADR-028 consequence).
