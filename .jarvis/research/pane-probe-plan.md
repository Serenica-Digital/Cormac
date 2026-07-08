# Excel pane probe plan (#67 stage 1)

> **Status:** plan · **Written:** 2026-07-08 · **Companion:**
> `microsoft-excel-integration.md` (the platform facts), ADR-0009 (the GO/NO-GO record
> this plan fills). v0 references: `archive/docs/adr/030` (the unfilled results table),
> `archive/docs/adr/031` (the pane architecture), `archive/docs/runbooks/pane-sideload.md`
> (proven sideload mechanics), `archive/apps/pane/` (the built probe app).

Purpose in one line: before writing any real pane code, measure the five things about
Excel's embedded browser that decide whether the pane can be the product's main user
interface, and record a GO or NO-GO with pre-committed kill criteria.

## The five probes

Adapted from v0's unfilled ADR-030 table. Each cell of the results table (in ADR-0009)
gets an objective readout, not an impression.

| Probe | Question | v2 adaptation |
| --- | --- | --- |
| A · streaming | Does an SSE stream arrive incrementally in the pane's webview, or buffered in one burst? | v2 has no outward SSE route; add a small probe route to the control plane (sibling of `POST /api/workspaces/:id/capture`, same auth chain; port of `archive/apps/api/src/routes/capture-stream.ts`). Wall-clock ticks suffice: the probe is about the transport, not the payload. |
| B · auth | Which sign-in lanes yield a Supabase session, per platform? Same `auth.users` row across lanes? | Lane 0 (password) against the local dev stack; Lanes A (NAA silent) and B (dialog) need the managed staging project + a sign-in-only Entra app registration. Apply the hashed-nonce fix for Lane A (supabase/auth #1926). |
| C · read latency | `context.sync()` timing and payload size on a realistic multi-sheet workbook; where reads error | Use the anonymized relationship-crm fixture from `evals/workbook-authoring/` as the workbook. |
| D · interview gestures | Can the pane highlight an agent-named range and render a draft review? | Pure Office.js; port `archive/apps/pane/src/probe/workbook.ts` scaffolding. |
| E · change capture | Does `onChanged` fire reliably (typing, paste, dropdown)? Local vs Remote source? | The June "dropdown gap on web" claim is stale (#3888 fixed May 2024); verify empirically anyway. |

Platform matrix: Mac desktop (WKWebView) first, since that is the machine on hand;
Windows desktop (WebView2) via a VM second; Office on the web last (see environment).
The platform that ultimately matters most is the design partner's primary one, which is
an unanswered fact (below).

## Kill criteria (committed before any probe runs)

NO-GO on any of these, recorded in ADR-0009 with the readout that triggered it:

1. **Auth floor fails:** no lane, including Lane 0 password, yields a working Supabase
   session inside the webview on desktop Excel. (Lanes A/B failing is not a kill; Lane 0
   + dialog fallback is a shippable pilot posture.)
2. **The conversation cannot render:** no transport (SSE incremental, SSE buffered, or
   plain request/response with a progress spinner) can show an agent conversation that a
   user would sit through. Buffered-but-arriving is acceptable; a webview that cannot
   sustain the connection at all is not.
3. **The workbook is unreadable:** the realistic fixture cannot be read (hard errors on
   ordinary sheets) or a summary read takes so long the interview is unusable
   (threshold: >30s on the fixture).
4. **The interview gesture is impossible:** range highlighting or draft rendering cannot
   be made to work. This kills the pane's core differentiator (interviewing over the
   live workbook).

Explicitly not a kill: Probe E unreliability (capture-by-explicit-gesture remains; record
as scope reduction), Lane A failure (fallback exists), Office-web-only failures if the
partner is desktop-primary (record as a platform restriction).

**What NO-GO reverts to** (v0 ADR-028's named reversal): the web app becomes the primary
client surface; the interview UI builds there; the pane demotes to a later, optional
door. The agents, contract, and pipeline are unaffected either way.

**GO means:** probes A-D pass on at least one desktop platform with Lane 0 auth working;
ADR-0009 records the readouts; stage 2 (the interview in the pane) is unblocked.

## Environment decision (the containerization question)

**Decision: probe on the cheap local setup; do not pull the kind rehearsal (#68)
forward for stage 1.** Reasoning:

- No probe's trustworthiness depends on production-shaped TLS or domains. The probes
  measure webview behavior (streaming, auth, latency, gestures, events); the webview
  neither knows nor cares whether the origin is a laptop or a cluster.
- v0's proven dev pattern is exactly this (runbook, 2026-06-14): pane dev server on the
  host with an Office-trusted localhost certificate (`office-addin-dev-certs`; on Mac,
  the cert must be Safari-trusted since WKWebView shares that store), backend wherever
  it runs. v0 explicitly warned against serving the pane from inside a cluster for
  sideload development.
- Desktop Excel tolerates localhost origins (WebView2 confirmed unaffected by the
  local-network-access enforcement; Mac assumed equivalent, verified at probe time).
  Only Office on the web wants a public HTTPS origin; for that single case a tunnel
  (e.g. cloudflared) in front of the local servers is cheaper than a cluster, and the
  Office-web pass can simply run last.
- The v0 lesson stands (ADR-0002's spirit): infrastructure is always more tractable than
  the risky question, and it eats the schedule if allowed in front.

**What #68 remains for, unchanged:** the pilot. The manifest permanently pins the pane's
public domain, so a stable custom domain + TLS on a deployed host is a prerequisite for
any partner-facing install. That is pilot-track work (kind rehearsal then EKS, ADR-0003)
and it can start after, or in parallel with, a GO; the probes do not wait on it.

Concrete probe stack:

- Control plane: `pnpm dev` under `infisical run` (dev slot, local Supabase CLI stack,
  ADR-0006/0007). Prep item: the control plane needs CORS allowance for the pane origin
  (config-level change, not new surface).
- Pane: the ported probe app served by its Vite dev server at `https://localhost:<port>`
  with the Office dev cert.
- Lane A/B auth probes only: `INFISICAL_ENV=staging` against the managed project, plus
  the one-time Entra app registration (sign-in-only scopes) and Supabase Azure provider
  config from the runbook, section 4.
- Sideload: Mac via the `wef` folder script (verified mechanics on Excel 16.109.3;
  re-confirm on the current build), Windows via trusted catalog or
  `office-addin-debugging`, web via Upload My Add-in.

## Port-vs-rebuild: `archive/apps/pane`

**Port it.** The v0 probe app (~81 files) was built for exactly this measurement: the
`SignInLane` seam (`src/auth/lanes.ts`), the probe scaffolding
(`src/probe/workbook.ts`), the dialog relay pages (`relay.html`, `callback.html`), the
manifest, and the platform detection are all reusable by design. Expected changes:

- New package in the v2 pnpm monorepo (`apps/pane`), wired to workspace tooling.
- API client repointed at the v2 control plane paths
  (`/api/workspaces/:workspaceId/...`) and the v2 SSE probe route.
- Env plumbing per ADR-0005/0006: values injected via `infisical run`, no `.env`.
- Manifest URLs and IDs regenerated; ExcelApi 1.14 floor kept.

The one genuinely new server piece is the SSE probe route (small, feature-flagged, same
auth chain as capture, port of v0's `capture-stream.ts`). Everything else on the server
already exists in v2.

## Facts to collect from the design partner (conversation, not code)

Carried from the v0 runbook; needed before the pilot plan, useful before the probes:

1. Office version and SKU (Microsoft 365 Business vs "Apps for Business" vs perpetual;
   centralized deployment needs Exchange Online mailboxes).
2. Reseller: a GoDaddy-resold tenant blocks every deployment path and would mean tenant
   migration before go-live.
3. Excel desktop vs web usage (decides which platform column of the results table is
   load-bearing).
4. Whether their tenant blocks add-in sideloading, and who the M365 admin actually is.

## Stage 2, sketched only (gated on GO)

The authoring interview inside the pane: the pane renders the interview conversation
over the existing `/api/workspaces/:id/authoring/turn` route, reads the open workbook
instead of the uploaded copy, and highlights the column under discussion. This is also
the vehicle for the deferred human-played interview (ADR-0004 criterion 3) and the
interview UI the owner deferred it for. Not planned in detail here; a GO plus the stage
1 readouts (especially Probe C latency and Probe A transport shape) are its design
inputs.
