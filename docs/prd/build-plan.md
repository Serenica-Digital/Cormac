# Build Plan

> **Status:** canonical · **Last reviewed:** 2026-06-13

Companion to [architecture.md](architecture.md) and [contract-model.md](contract-model.md). Those two describe *what* we are building; this one describes *how and in what order*. The why for every choice lives in the ADRs; this doc records the sequence and points back. The board (Project #3) is the live tracker; its milestones mirror the eight below, and issue numbers here are pointers into it.

## Where the build stands

The original plan here (foundation, then a walking skeleton as the spike) completed and converted its bets:

- **Phase 0 and the walking skeleton are done and verified.** Capture → propose → validate → confirm → write → audit runs end to end against real Postgres, with the cross-tenant isolation suite, purge, and atomic apply in place.
- **The runtime seam is real, not stubbed (ADR-025/026).** Hermes (pinned image) runs the operations agent as a tool-user against the control plane's MCP tool server; a proposal is a schema-enforced tool call. The old "MCP server" deferral is dead: the MCP surface is now the spine.
- **The knowledge layer shipped (ADR-027).** Glossary in the contract, typed learned knowledge behind a gate, and the compiled context prefix delivered through run instructions. Measured: 5 tool calls/21s/$0.045 per task down to 2-3 calls/8-15s/~$0.03, cross-run cache reuse proven.
- **The surface strategy pivoted (ADR-028).** The Excel task pane add-in is the primary client surface; the web app is the admin/trust/fallback door. The research phase ran ([../research/microsoft-ecosystem-integration.md](../research/microsoft-ecosystem-integration.md)); the pane build is gated on its spike and a GO/NO-GO ADR.
- **The env, secrets, and deployment foundation landed (ADR-037/038).** One generated env contract from a single manifest, Infisical the secret authority synced via ESO, and the whole backend proven on local k3d with the same Helm charts that deploy to Juno (managed Supabase everywhere except CI), plus the Terra packaging. This is the deployment groundwork M5 builds on; the live Juno cluster deploy is gated on the onboarding session (#15).

What v1 means: **the pilot live on the design partner's real business.** Everything below is sequenced toward that.

## The eight milestones to v1

Ordering logic: the two highest-risk unknowns (the pane platform, the authoring agent) go first and run in parallel; user-facing assembly builds on them; deployment precedes SMS because the webhook needs a public endpoint; pilot readiness is last and is v1.

### M1: Pane proof and GO/NO-GO

The ADR-028 spike checklist against a sideloaded XML-manifest pane: streaming through WebView2/WKWebView, the Lane A sign-in (NAA token exchanged for a Supabase session) and the dialog fallback, `context.sync` latency on a realistic workbook, range highlighting, onChanged reliability. Plus the pane architecture design and the identity-linking schema design (load-bearing for pane auth). Closes #52 and folds #31/#32/#33. Ends with the follow-up ADR: GO/NO-GO and the re-scoped pane issue set.

*Done when every spike item has a measured answer and the follow-up ADR is committed.*

### M2: Authoring engine, host-agnostic (parallel with M1)

The agent side of #17: multi-turn conversation state (#37), the consultative interview loop with the ask-user protocol, the identity-rules decision (#18), eval-harness extension over both existing fixtures (#28's spike artifacts). No UI; harness only. Plain-language question register is part of the eval bar, not a polish item.

*Done when a partner-shaped workbook goes interview → draft contract → publish in the harness, evals green.*

### M3: The pane ships, operations first

The task pane built to M1's design: both auth lanes, streaming chat capture, review queue with proposal diffs, the Office.js tool bridge (read/highlight; approved-write execution as a surface action). Minimal web record views land alongside (#19); clarifying-question UX on the operations path (#38). Sideloaded, dev workspace.

*Done when daily CRM capture happens inside Excel and the terminal demo is retired.*

### M4: The authoring interview moves into the pane

M2's engine mounted in M3's pane against the live open workbook: column highlighting while it asks, draft-contract review, publish gate. The keystone onboarding moment (ADR-023). Issues for this milestone are cut by M1's follow-up ADR.

*Done when someone who is not the developer onboards a workbook they brought, unassisted.*

### M5: Deployed and multi-user

The Juno spike (#15) becomes a hosted dev/staging environment, and the hardening backlog that waited on it lands: run-stream release (#51), atomic-apply live verification (#1), ops tooling (#40), audit legibility (#42, #43), event logging/redaction (#41), deny-hook CI (#44), runtime ops (#14), the Terra Postgres question (#16), an RBAC multi-user pass, backups.

*Done when a second human logs into a hosted URL and the isolation and audit suites pass against that environment.*

### M6: The SMS door

Twilio webhook connector on the hosted endpoint, sender claims on the identity spine (arrival trust, propose-only), confirmation round-trips. A2P registration (#24) is calendar-bound and starts during M1 so approval never gates this milestone.

*Done when a text from a phone files a proposal that appears in the pane's review queue.*

### M7: Modes, reporting, agent quality

apply-then-report and the weekly report (#21), the eval gate that authorizes switching a workspace to it (#22), contract-aware search (#36), reporting read model (#23), record identity/dedup enforcement (#7), the learning loop's report surface (#35). This is the original product motivation: low-friction daily updating, safety net instead of approval fatigue.

*Done when the demo workspace runs apply-then-report for a week and the digest is accurate.*

### M8: Pilot readiness (v1)

Security packet reconciled against everything built (pane, SMS, learning rows); the partner's M365 SKU and reseller verified plus a centralized-deployment dry run; partnership, IP, and design-partner terms settled (#25, the longest-standing P0 and a business decision); the pricing-tier decision; the pilot onboarding runbook. The publisher track (DUNS, Partner Center, verification) started back in M1 lands whenever it lands; it does not gate the pilot.

*Done when the partner's live business runs on it. That is v1.*

## Tracks that run on their own clock

Start these during M1; they are calendar-bound, not effort-bound:

- **A2P 10DLC registration** (#24): carrier approval takes days to weeks; gates M6.
- **Publisher track**: DUNS number, Partner Center enrollment, business verification (6-10 weeks end to end for a new LLC, per the research). Gates the AppSource listing, which is post-v1; gates nothing in M1-M8.
- **Partnership and design-partner terms** (#25): a business decision, named here so it is never lost; gates M8.

## Explicitly post-v1

The generated contract-constrained workbook and validate-at-sync engine (#29, #30; the pane subsumes their interactive UX for the pilot), email ingestion, the external Claude/MCP door, the Graph permission ladder beyond stage 0, the Outlook host, the AppSource listing itself, relationships as first-class edges (#20).

## The verification bar

Unchanged in spirit from the skeleton days: every milestone's done-when is demonstrated against a live system, not claimed from green checkmarks. Cost and latency are part of acceptance for agent-facing work (the ADR-026/027 precedent: measured numbers on the tracking issue). Trust-boundary changes take a branch and a PR into dev; the isolation and purge suites are the floor for every milestone that touches the schema.
