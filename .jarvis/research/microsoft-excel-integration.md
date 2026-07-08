# Microsoft and Excel integration: consolidated current truth

> **Status:** reference · **Written:** 2026-07-08 · **Supersedes for current use:**
> `archive/docs/research/microsoft-365-connector-architecture.md` (2026-06-05),
> `archive/docs/research/excel-schema-contract-and-sync.md` (2026-06-05),
> `archive/docs/research/microsoft-ecosystem-integration.md` (2026-06-12), and the pane
> decisions `archive/docs/adr/028/030/031/032`. The archive files stay untouched as history.

Plain-language framing first. The Excel task pane is a small website we host; Excel loads
it in an embedded browser next to the open spreadsheet, and Office.js is the bridge that
lets it read and mark up that spreadsheet. It is the product's intended main user
interface. **None of it is built in v2.** v0 ran a 67-agent verified research pass
(2026-06-12), designed the pane architecture, built a probe app (~81 files,
`archive/apps/pane/`), and wrote a GO/NO-GO decision document whose five-probe results
table was never filled: the v0 archive (2026-06-19) happened before the observation
sessions ran. Issue #67 resumes that interrupted experiment against the v2 control plane.

Verification labels: **verified** means it survived the June 12 adversarial verification
pass (3 independent refuters per claim) or was directly exercised; **assumed** means
inferred and not yet exercised. Facts that age carry a re-check note; July 2026 updates
are folded in where marked.

## 1. Direction (settled in v0, carried into v2 requirements)

- The pane is the primary client surface; the web app is the admin/trust/fallback door;
  SMS is field capture (v0 ADR-028; carried in `.jarvis/prd/requirements.md`).
- **Microsoft is distribution, never identity**: no Dataverse/Power Platform as system of
  record, Entra sign-in optional never required, the agent's reasoning loop never inside
  Microsoft's orchestrator, no per-user Microsoft licensing as a precondition.
- The trust boundary is unchanged by the pane: it holds no secrets, no database access,
  no Graph permissions at pilot; every change goes through the control plane's proposal
  pipeline. An approved write rendered back into the sheet is a surface action on an
  already-audited decision, not a new writer.

## 2. Pane platform reality (verified 2026-06-12 unless noted)

- **Manifest:** XML add-in-only manifest is the lower-risk choice for production Excel
  panes and admin-center deployment in 2026. The unified (JSON) manifest for Excel is
  still officially **preview** as of 2026-07-08 (re-verified: Microsoft's docs still
  instruct dual manifests for unsupported platforms). XML stands.
- **API floor:** ExcelApi 1.14 as manifest minimum (covers every current M365 seat,
  Office 2021 LTSC, web, Mac, iPad; excludes Office 2019 perpetual, end-of-support
  2025-10-14). Gate newer sets with runtime `isSetSupported`. Open item: whether LTSC
  RTM builds carry 1.14 or only 1.13 (one probe line).
- **No save event exists.** Office.js has no on-save/before-save/after-save hook.
  Capture triggers are `Worksheet.onChanged`/`Table.onChanged` plus explicit user
  gestures. The June research carried "dropdown edits do not fire onChanged on Excel
  web" as an open gap; **that was stale: office-js #3888 was fixed May 2024**
  (Excel online >= 16.0.17706.42307, reporter-confirmed; re-verified 2026-07-08). Probe
  E still checks it empirically. Events die when the pane closes; sync-on-reopen is by
  diff.
- **Streaming works in the webview.** WebView2 (Windows), WKWebView (Mac), and the web
  iframe all support fetch ReadableStream, SSE, and WebSockets; Office injects no
  blocking CSP. Use POST-based SSE (`@microsoft/fetch-event-source`) against the control
  plane.
- **Webview constraints:** office.js nullifies `history.pushState` (hash routing only);
  office.js requires `unsafe-eval`/`unsafe-inline` in our CSP; the Dialog API needs its
  first page on our own full domain, one dialog at a time, and must not interact with
  the document; 5 MB payload ceiling per request on Excel web, 5M cell cap on range
  reads everywhere; every `context.sync()` is a cross-process (on web, network) round
  trip, so batch loads and never sync in a loop; single bulk `range.values` writes,
  never per-row (a 2024 undo-stack regression cut large table writes ~12.5x, still open
  as of June).
- **Platform stability risk is real and priced in** (v0 ADR-028 accepted it): a
  233-developer open letter (office-js #6513) documents silent CDN-side breaking
  changes, ~1,100 open issues, recurring regressions, and Microsoft investment visibly
  rotating to Copilot extensibility. Blast radius is the door only: the pane can break
  from a Microsoft update, deployment can stall, and error attribution lands on us. It
  never touches the write path, the data, the contract, or the gates (those live in our
  containers). Mitigations are structural: web fallback stays feature-complete for
  capture and review, the pane stays thin, smoke-test the partner's actual
  configurations, watch the OfficeDev known-issues feed. Re-verified 2026-07-08: the
  letter (#6513) is still open with no substantive Microsoft response (last activity
  2026-06-03). The June posture stands unchanged.
- **"Agent in the pane" is our own chat UI in a standard task pane.** Microsoft's
  declarative-agent path runs only on Microsoft's Copilot orchestrator with Microsoft
  models and cannot host our agent. Our path (pane calls the control plane over HTTPS,
  the control plane drives Hermes per ADR-0001) is fully permitted with no Copilot
  license, provided the manifest declares no `copilotAgents` node. Reference
  implementation in the open: hewliyang/office-agents (tool-layer reference only).

## 3. Auth in the pane (design from v0 ADR-031; lanes unproven until Probe B)

The control plane validates any Supabase JWT provider-blind (JWKS/ES256, issuer,
`aud=authenticated`, then its own membership check); v2 re-proved that posture on managed
Supabase in #66 phase 7. The pane mirrors that with lane-blind sign-in: one Supabase
client, one session store (partition-keyed by `Office.context.partitionKey`), and a
`SignInLane` interface so lanes differ only at mint time.

| Lane | Mechanism | Status |
| --- | --- | --- |
| 0 · password | Supabase `signInWithPassword` in-pane | works in-pane, zero Azure (verified in v0 spike code; unexercised in Excel) |
| A · NAA silent Microsoft | MSAL `acquireTokenSilent` then Supabase `signInWithIdToken` | doubly unproven: Supabase id-token nonce/audience acceptance, and a Mac WKWebView abort |
| B · dialog fallback | Office dialog runs the Supabase OAuth code flow, tokens back via `messageParent` | documented fallback, hand-rolled relay plumbing, unexercised |

Platform facts (verified 2026-06-12): NAA and Office SSO support only Entra ID and MSA
identities (no third-party IdPs, no B2C); on Office web, NAA works only for documents
opened from SharePoint/OneDrive. Basic sign-in scopes are exempt from the
unverified-publisher consent block, so a minimal sign-in-only Entra app registration
consents cleanly with no admin involvement. Session persistence: WebView2 localStorage
survives Excel restarts on Windows; Mac WKWebView has no authoritative guarantee, so
design for silent re-auth on pane open. Never use localStorage as a dialog-to-pane
bridge (storage partitioning).

**The identity fork rides on Probe B** (v0 ADR-032): if Microsoft sign-in lands on the
same `auth.users` row as the password account, identity linking stays LEAN (key
everything to `auth.users(id)`, add a `phone_claims` table only when the SMS door
builds). If it creates a second row, an app-owned identity layer re-keys memberships:
a trust-boundary change, built only if forced. v2's control plane keys authorization the
same way v0 did, so the fork carries over unchanged.

## 4. The Graph permission ladder (stage 0 now; later stages earned)

Consolidates the June 5 connector-levels note and the June 12 re-derivation into one
ladder. "Graph" is Microsoft's cloud API for tenant data; the pane needs none of it to
read the open workbook (installing the add-in is the consent).

- **Stage 0 (the pilot): zero Graph permissions.** Office.js reads the open workbook; no
  Entra app, no consent screen. Coefficient (closest comparable, $24.7M raised) ships
  this permanently. Our default until evidence demands more.
- **Stage 1 (user-scoped file access):** `Files.Read`/`Files.ReadWrite` delegated. Since
  2020, user consent to unverified multi-tenant apps is blocked by default past basic
  sign-in, so get Entra publisher verification first and route through admin-consent
  URLs.
- **Stage 2 (site-scoped):** `Sites.Selected`. Caveats: consent alone grants zero
  access (a privileged per-site grant call is also needed) and file-level grants break
  SharePoint permission inheritance.
- **Stage 3 (mail/contacts, the email door):** `Mail.Read`/`Contacts.Read` delegated,
  requested lazily at feature enablement, never at install. Never the application-level
  (tenant-wide) variants.
- Throttling only matters for background sync loops (Excel API 1,500 req/10s per tenant,
  5,000/10s per app across tenants), one more reason the pane path leads.

Onboarding posture (June 5 note, still sound): consent-based, incremental, per-feature;
we own the multi-tenant app registration; expect small customers to not know who their
Microsoft admin is; degrade gracefully ("works standalone, better connected,
powerful when admin-approved").

## 5. Excel sync strategy (deferred; the contract model already covers the near term)

The June 5 sync-levels ladder holds: manual upload (level 0) and contract-driven
import/export (levels 1-2) before any live sync; arbitrary-workbook sync (level 4) is
deferred indefinitely. What that note demanded of the data model (stable record IDs,
stable field IDs independent of column labels, versioned contracts, sync snapshots,
explicit conflict handling) is now simply what the v2 contract is; nothing new to build
for the pilot.

For the eventual live-sync milestone (verified 2026-06-12): the pane subsumes the
validate-at-sync UX interactively (drafts accumulate from change events, user reviews,
approval submits through the proposal pipeline: Coefficient's proven shape, and our
current-vs-proposed display is a visible differentiator they lack). Row identity is
stamped record IDs in a hidden column (settings and custom XML parts hit ~1 MB caps).
The server-side channel (Graph Excel REST) is real but constrained (business
OneDrive/SharePoint only, ~5 min session expiry, strictly sequential writes per
workbook) and stays a deferred background channel; the pane path needs none of it.

## 6. Distribution and the publisher track

- **The pilot needs no store presence at all** (verified 2026-06-12): the design
  partner's admin uploads our manifest through the M365 admin center (LOB deployment).
  No AppSource listing, no Partner Center account, no publisher verification.
  Constraint: centralized deployment requires every target user to hold an Exchange
  Online mailbox (Business Basic/Standard/Premium qualify; "Apps for Business" does
  not); a GoDaddy-resold tenant blocks every path including AppSource.
  **Standing action: confirm the partner's exact M365 SKU and reseller before any pilot
  plan firms up.** Sideload (the probe path) needs only a manifest file and our HTTPS
  origin.
- **The public-listing clock is long and parallelizable:** Partner Center business
  verification (DUNS is the long pole, up to ~6 weeks) plus AppSource certification
  (up to 4 weeks, first submissions commonly fail) totals 6-10+ weeks calendar for a new
  LLC. Entra publisher verification (the consent-screen checkmark) only matters when we
  ask for Graph scopes, which stage 0 never does. Publisher Attestation (the security
  self-questionnaire, under an hour, annual) is worth doing because IT admins read it.
  Start DUNS/Partner Center when a public listing is actually wanted; the pilot is fully
  decoupled.
- Monetization stays external SaaS billing (zero Microsoft fees); the transactable
  marketplace offer is a poor fit for a non-Azure backend. AI-content rules apply to the
  listing (disclose the AI, visible disclaimer, report mechanism; privacy policy must
  name Anthropic as a processor).

## 7. Hosting and deployment constraints (the containerization tie-in)

The pane is a static single-page app served from our containers, deployed like any other
v2 service under ADR-0003 (plain OCI images + Helm, kind rehearsal locally, EKS as the
product target). Facts that bind the deployment work (verified 2026-06-12):

- **HTTPS is mandatory everywhere**, including dev sideloads. v0's proven dev pattern
  (runbook, 2026-06-14): backend wherever it runs, but the pane dev server on the host
  with an Office-trusted localhost cert (`office-addin-dev-certs`); on Mac, WKWebView
  shares Safari's trust store. Explicitly do not serve the pane from inside a cluster
  for sideload development.
- **The manifest pins the pane's public domain effectively permanently** (URL changes
  propagate unreliably, documented weeks-long staleness). A stable custom domain + TLS
  is therefore a pilot prerequisite, not a later step (already in
  `.jarvis/prd/requirements.md`). Keep every manifest URL permanent and ship updates
  server-side behind them.
- **Proxy/header constraints:** the reverse proxy in front of the pane must not send
  `X-Frame-Options: SAMEORIGIN` (Office web loads the pane in an iframe); use
  `frame-ancestors`. AppDomains in the manifest takes no wildcards (one full subdomain
  per entry) and governs navigation, not fetch (fetch is plain CORS: the control plane
  must allow the pane origin).
- **Pane-host uptime is user-facing in the most visible way**: the deployment portal
  never checks the URL; an unreachable host is a blank pane at click time.
- office.js must load from Microsoft's CDN for AppSource distribution (policy); for
  LOB/sideload it is a recommendation.
- **Dev-environment note for the probes:** Chromium's local-network-access enforcement
  blocks task-pane connections to localhost on Office *web*; desktop WebView2 is
  confirmed unaffected (office-js #6281, closed "completed" 2026-01-28; late comments
  show web-host behavior still murky). Assumed (reasoned, unexercised): LNA gates on
  network locality, so the kind rehearsal's `*.localtest.me` names do not help (they
  resolve to 127.0.0.1); probing on Office web wants a genuinely public HTTPS origin
  (a tunnel, or a deployed host). Desktop probes tolerate the plain localhost dev
  server.

## 8. What only a live probe can settle

Carried from the June 12 spike list, minus what v2 has since settled elsewhere; the
probe plan (`.jarvis/research/pane-probe-plan.md`) owns these:

1. SSE arrival behavior through WebView2 and WKWebView (incremental vs buffered).
2. The sign-in lanes per platform, and the Probe B identity verdict (same or different
   `auth.users` row) that selects the identity-linking option.
3. `context.sync()` latency and payload ceilings on a realistic multi-sheet workbook.
4. Range highlighting + draft review rendering (the interview gestures).
5. onChanged reliability (the dropdown gap; Local vs Remote source; paste behavior).
6. Whether Office 2021 LTSC RTM carries ExcelApi 1.14.
7. Whether history.pushState is still nullified by the live office.js bundle.

One v0 finding needs re-derivation rather than reuse: v0 assumed "Hermes returns only a
terminal result, so pane streaming is progress streaming." v2's ADR-0001 transport has
live SSE run events (`/v1/runs/{id}/events`: tool starts, approvals) consumed by the
control plane today. What the pane can actually show mid-run is now a control-plane
relay question, not a Hermes limitation question. The v2 control plane currently
exposes no outward SSE route (verified against `apps/control-plane/src/routes/`,
2026-07-08); the probe needs a small one, with v0's
`archive/apps/api/src/routes/capture-stream.ts` as the porting reference.

## Facts re-verified 2026-07-08 (July status)

Checked against the GitHub issues and current docs on 2026-07-08; corrections are also
folded into the sections above.

- **office-js #6513 (the stability open letter): still open**, 45 comments, no
  substantive Microsoft response, last activity 2026-06-03. The platform-risk posture
  stands.
- **office-js #6181 (Excel sideload bug): closed 2025-10-20.** The June doc listed it as
  an open operational bug; treat sideload health as probe-time empirical, not
  known-broken.
- **office-js #5526 (add-in hidden when MinVersion > 1.13): still open**, but it is
  Outlook-specific; low relevance to the Excel pane.
- **office-js #6281 (Chrome LNA localhost block): closed "completed" 2026-01-28.**
  Desktop WebView2 confirmed unaffected; Office-web behavior remains murky in the late
  comments. Consequence for the probe environment recorded in section 7.
- **office-js #3888 (dropdown onChanged gap on Excel web): fixed May 2024**, Excel
  online >= 16.0.17706.42307, reporter-confirmed. The June "open" claim was stale.
- **Unified manifest for Excel: still preview**, no GA; Microsoft docs still instruct
  dual manifests for unsupported platforms. XML add-in-only manifest choice stands.
- **Supabase `signInWithIdToken` with Entra: Azure is a documented supported provider**
  (with Google, Apple, Facebook). The known failure v0 flagged (nonce mismatch) is real
  and open (supabase/auth #1926) **with a community-confirmed fix** (Aug 2025): pass the
  SHA-256-hashed nonce to Azure/MSAL and the raw nonce to `signInWithIdToken`. Lane A
  stays probe-gated but now has a documented working pattern.
- **Hermes streaming (desk check against our own stack):** v2's control plane consumes
  live SSE from Hermes `/v1/runs/{id}/events` (ADR-0001, live-proven in the ops eval)
  but exposes **no outward SSE route** on `/api/*` (verified against
  `apps/control-plane/src/routes/`, 2026-07-08). v0's "progress streaming only" framing
  is now a relay-design question we control, not a Hermes limitation.
- Not re-checked (stable or not currently cited as load-bearing): publisher/DUNS
  timelines, Coefficient pricing, Agent 365 licensing. Re-verify when the distribution
  track actually starts.
