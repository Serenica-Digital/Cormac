# ADR-031: The Excel pane architecture and the systematic sign-in lanes

**Status:** Proposed (the design the M1 spike validates; the pane build commits on ADR-030's GO)
**Date:** 2026-06-12
**Related:** Implements the direction of ADR-028 (the pane as primary client surface). Builds on ADR-007 (one agent service, many doors) and ADR-011/ADR-020 (Supabase brokers auth, the control plane decides authorization). The GO/NO-GO that promotes this design is ADR-030; the identity-linking half is ADR-032. Validated by the spike scaffold ([../../apps/pane](../../apps/pane)) and the SSE route ([../../apps/api/src/routes/capture-stream.ts](../../apps/api/src/routes/capture-stream.ts)), measured via [../runbooks/pane-sideload.md](../runbooks/pane-sideload.md). Evidence base: [../research/microsoft-ecosystem-integration.md](../research/microsoft-ecosystem-integration.md).

## Context

ADR-028 made the Excel task pane the primary client surface and gated the build on a measurement spike. The spike needed a concrete architecture to test, and three forces shaped it:

- **The pane is a thin adapter over the one pipeline (ADR-007), not a new app.** It renders inside Excel's webview with Office.js as its only bridge to the open document. It must hold no business logic, no write authority, and no secrets (REQ-004). So the design question is how to share with `apps/web` and isolate what is Office-specific.
- **Hermes returns only a terminal result; there is no token stream** (the research finding). So pane "streaming" can only be progress streaming, and the spike has to prove an SSE transport survives the webview rather than a token feed.
- **Auth in the pane sandbox is the load-bearing unknown.** The control plane already validates any Supabase JWT regardless of how it was minted ([../../apps/api/src/auth.ts](../../apps/api/src/auth.ts) is provider-blind: JWKS/ES256, issuer, `aud=authenticated`, then its own membership check). The client should mirror that lane-blindness, but silent Microsoft sign-in is doubly unproven (Supabase id-token nonce/audience rejection; the NAA Mac WKWebView abort), so the sign-in design must make the lanes comparable and the failures legible.

## Decision

### 1. One codebase, many hosts

`apps/pane` is a thin SPA we host, an adapter over the control-plane pipeline exactly like every other surface (ADR-007). The same React components and the same control-plane API back both the pane and the web app.

- **Excel is the first host; Outlook is the candidate second host** (timing decided in ADR-030's follow-up). Office add-ins are multi-host by design, so the same web code can mount in another Office host behind a host branch; host-specific code stays in the Office bridge, never in the components.
- **The web app stays the admin, trust, and fallback door** (ADR-028). The pane never becomes the only way in.
- **Manifest:** XML add-in-only, ExcelApi 1.14 as the requirement floor; newer API sets are runtime-gated with `isSetSupported`, never required in the manifest (REQ-004). The manifest pins the pane's public domain effectively permanently, which is why the pane workload needs a stable custom domain and TLS from day one (deployment-setup.md; Juno onboarding question 12).
- **Routing is hash-only.** Office.js nullifies `history.pushState` inside the pane, so the hash is the one navigation channel that survives the sandbox.

### 2. The systematic sign-in lanes

A sign-in lane is the only place the flows differ. Everything downstream of a `Session` is shared and never branches on lane, mirroring the control plane's provider-blind auth. The contract ([../../apps/pane/src/auth/lanes.ts](../../apps/pane/src/auth/lanes.ts)):

```ts
interface SignInLane {
  id: LaneId;                              // 'password' | 'naa' | 'dialog'
  label: string;
  description: string;
  available(platform: Platform): boolean;  // offer the lane on this platform at all
  signIn(): Promise<SignInOutcome>;        // mint, or fail with a typed FailureMode
}
```

The spine the lanes hang on:

1. **One Supabase client, one persistence owner.** Session storage is partition-keyed by `Office.context.partitionKey` so sessions do not bleed across Office document partitions. `detectSessionInUrl` is off; the pane is not an OAuth redirect target.
2. **After any lane succeeds, the session is already in the SDK.** `signInWithPassword`, `signInWithIdToken`, and the post-dialog `setSession` all persist it, so the bearer token for the SSE call and for every other request is one lane-blind line.
3. **Probe B is apples-to-apples by construction.** The `user.id` readout reads the one shared session after each lane, so comparing the Microsoft lanes' id against the password id is a property of the spine. That comparison selects the identity-linking option (ADR-032).
4. **One `FailureMode` vocabulary across all lanes**, so the diagnostic readout is uniform and comparable per platform.

The three lanes, in order of certainty:

| Lane | Mechanism | What we own | Status |
| --- | --- | --- | --- |
| 0 · password | Supabase `signInWithPassword` | nothing; one SDK call | works in-pane today, zero Azure |
| A · NAA silent | MSAL `acquireTokenSilent` then Supabase `signInWithIdToken` | orchestration + failure classification | doubly unproven (nonce/aud; Mac WKWebView abort) |
| B · dialog | Office dialog runs the Supabase OAuth code flow, tokens back via `messageParent` | the dialog relay plumbing | the documented fallback |

The only genuinely hand-rolled code is the Lane B dialog relay (the Office Dialog API is its own message channel) and the partition-keyed storage shim. Neither touches crypto or identity logic; MSAL, Supabase, and `jose` do all of that. Lane B keeps its PKCE verifier in the dialog's own origin storage between `relay.html` and `callback.html`; only the final tokens cross the Office boundary, never shared storage. Adding a future lane means implementing the one interface; nothing downstream changes.

### 3. The SSE progress model

Because Hermes streams no tokens, pane streaming is progress streaming. The control plane's probe route ([../../apps/api/src/routes/capture-stream.ts](../../apps/api/src/routes/capture-stream.ts)) emits `received`, then a `progress` heartbeat and a tick every `SSE_TICK_MS`, then `result` and `done`, around the unmodified `captureUpdate` pipeline. It is a sibling of `POST /capture` with the identical authz chain, so the spike proves the transport without touching the runtime adapter. The probe ticks are wall-clock; the M3 production shape pushes an `onProgress` callback into `runHermesTask`'s poll loop so ticks carry real run state. The transport is what M1 proves; the payload gets richer in M3.

### 4. The Office.js tool-bridge contract

The pane's reach into the open workbook is a small, explicit set of verbs, all read or surface-action, never a write path into business records ([../../apps/pane/src/probe/workbook.ts](../../apps/pane/src/probe/workbook.ts)): `readWorkbookSummary()` (timed sync reads with payload sizing), `highlightRange(address)`/`clearHighlight(address)` (the interview's column-pointing gesture), and `startOnChangedLog(onEvent)` (change capture, including the data-validation-dropdown case and the Local/Remote source). The invariant from [../prd/architecture.md](../prd/architecture.md) holds verbatim: the pane reads and relays; every change goes through the control plane's proposal pipeline; an approved write rendered back into the sheet is a surface action on an already-audited decision, not a new writer. There is no save-event hook; capture triggers are change events plus explicit user gestures.

## Consequences

- The pane shares components, the API client, and the auth model with `apps/web`; only the Office bridge, the manifest, and the dialog lane are pane-specific.
- The lane-blind design contains the Probe B fork (ADR-032): whichever way identity linking lands, the lane implementations do not change.
- The pane holds no secrets, no database access, and no Graph permissions (v1 is Graph stage zero). Everything dangerous stays server-side, which is what the security packet points at; the packet gains an add-in deployment and pane-sandbox section on GO.
- The custom-domain/TLS requirement for the pane workload goes onto the Juno agenda (deployment-setup.md, Juno question 12).

## Alternatives considered

**A separate pane app with its own logic and its own auth.** Rejected: it would duplicate the pipeline and split behavior across surfaces, the exact failure ADR-007 exists to prevent. The pane is an adapter, not a second product.

**Per-lane bespoke auth flows.** Rejected: three ad-hoc flows make the lanes incomparable and the Probe B verdict unreliable, and they scatter session handling. The single `SignInLane` seam with a shared session spine is what makes the measurement clean and the failures legible.

**Token streaming in the pane.** Not available: Hermes returns only a terminal result. Progress streaming is the honest model, and the spike proves the transport rather than pretending a token feed exists.

## Open items

1. GO/NO-GO confirmation and the re-scoped pane issue set (ADR-030).
2. Outlook second-host timing (ADR-028 open item 2), settled on GO.
3. The production SSE payload (real run state via an `onProgress` callback in `runHermesTask`), deferred to M3.
