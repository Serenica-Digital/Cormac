# 0009 — Excel pane GO/NO-GO (skeleton; decided from live probe results only)

- **Status:** Proposed (skeleton; the decision is written once the results table below
  is filled from live runs)
- **Builds on:** ADR-0002 (gates cleared: keystone GO'd, skeleton built), ADR-0003 (the
  pilot's stable-domain/TLS prerequisite), ADR-0004 (the interview this pane will
  eventually host)
- **Evidence base:** `.jarvis/research/microsoft-excel-integration.md` (platform facts,
  re-verified 2026-07-08) and `.jarvis/research/pane-probe-plan.md` (the probes, the
  kill criteria, the environment decision). v0 precursor: `archive/docs/adr/030` (same
  shape, table never filled; the v0 archive predates the observation sessions).

## Context

The Excel task pane is the intended primary client surface (carried in
`.jarvis/prd/requirements.md`), and no UI of any kind exists in v2. Several platform
constraints are only trustworthy when exercised in real Excel, so the pane build is
gated on a measurement spike with pre-committed kill criteria. This ADR records the
result. The probe plan (including the decision to probe on the cheap local setup and
leave the kind rehearsal #68 on the pilot track) is in
`.jarvis/research/pane-probe-plan.md`.

## Results table (to be filled from live runs; no cell is ever inferred)

Discipline (Jarvis consult, 2026-07-08): the moment any probe cell is filled, this file
is updated with that result. A partially filled table is never read as if empty cells
said GO.

| Probe | Question | Mac desktop (WKWebView) | Windows desktop (WebView2) | Excel on web |
| --- | --- | --- | --- | --- |
| A · streaming | SSE incremental or buffered? (tick inter-arrival) | _tbd_ | _tbd_ | _tbd_ |
| B · auth | Which lanes yield a Supabase session; same `auth.users` row? | _tbd_ | _tbd_ | _tbd_ |
| C · read latency | `context.sync` ms + payload on the relationship-crm fixture | _tbd_ | _tbd_ | _tbd_ |
| D · interview gestures | Highlight an agent-named range + render draft review? | _tbd_ | _tbd_ | _tbd_ |
| E · change capture | onChanged reliability (typing, paste, dropdown); Local/Remote | _tbd_ | _tbd_ | _tbd_ |

Probe B detail, per lane and platform (`user.id` comparison selects the identity-linking
option, v0 ADR-032 carried forward):

| Lane | Mac | Windows | Excel on web |
| --- | --- | --- | --- |
| 0 · password | _tbd_ | _tbd_ | _tbd_ |
| A · NAA silent Microsoft | _tbd_ | _tbd_ | _tbd_ |
| B · dialog | _tbd_ | _tbd_ | _tbd_ |

Design-partner environment facts (from the conversation the probe plan lists): Office
SKU _tbd_, reseller _tbd_, desktop vs web _tbd_, sideload policy / admin path _tbd_.

## Kill criteria (committed 2026-07-08, before any probe ran)

Binding as written in `.jarvis/research/pane-probe-plan.md`: (1) Lane 0 auth fails in
the desktop webview; (2) no transport can render a conversation a user would sit
through; (3) the realistic fixture is unreadable or a summary read exceeds 30s; (4)
range highlighting / draft rendering cannot be made to work. Probe E unreliability,
Lane A failure, and Office-web-only failures are recorded limitations, never kills.

## Decision

_To be written from the table._ GO cuts the stage 2 issue (the authoring interview in
the pane, which is also the vehicle for the deferred human-played interview,
ADR-0004 criterion 3) and puts the pilot's stable-domain/TLS work on the #68 track.
NO-GO reverts the primary surface to the web app and records the readout that decided
it.

## Consequences

_To be written from the decision._
