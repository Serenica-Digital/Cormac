# ADR-030: Excel task pane GO/NO-GO (M1 spike result)

**Status:** Proposed (skeleton; the decision is taken once the M1 results table below is filled from live runs on Windows, Mac, and Excel-on-web)
**Date:** 2026-06-12
**Related:** The follow-up status ADR that ADR-028 gated the pane build on ("the follow-up status ADR records the GO/NO-GO and the re-scoped issue set"). Closes #52 and folds #31/#32/#33. Reads against the design ADRs [ADR-031](031-pane-architecture-and-sign-in-lanes.md) (pane architecture and sign-in lanes) and [ADR-032](032-identity-linking-schema.md) (identity linking), measured via [../runbooks/pane-sideload.md](../runbooks/pane-sideload.md). Evidence base: the research phase [../research/microsoft-ecosystem-integration.md](../research/microsoft-ecosystem-integration.md).

## Context

ADR-028 accepted the Excel task pane as the primary client surface as a direction and gated the build on a measurement spike, because several platform constraints are only trustworthy when exercised in real Excel. M1 built a minimal, instrumented `apps/pane` plus one new control-plane SSE route, both on `feat/m1-pane-spike`, held unmerged until this call. This ADR records the result and re-scopes the pane issue set.

Two research findings shaped the spike and bound this decision:

- **Hermes returns only a terminal result; there is no token stream.** So pane "streaming" is progress streaming. Probe A proves only that an SSE transport survives the webview; the production token story is out of scope for the decision.
- **Silent Microsoft sign-in is doubly unproven** (Supabase id-token nonce/audience rejection; the NAA Mac WKWebView abort). Lane A is a measure-it question; Lane B (dialog) is the documented fallback; Lane 0 (email/password) works in-pane today and unblocks the rest.

## The five probes and the results table

Filled from the runbook readouts. One row per probe, one column per platform. Each cell is the objective readout, not an impression.

| Probe | Question | Windows (WebView2) | Mac (WKWebView) | Excel on web |
| --- | --- | --- | --- | --- |
| A · streaming | SSE incremental or buffered? (progress-tick inter-arrival) | _tbd_ | _tbd_ | _tbd_ |
| B · auth | Which lanes yield a Supabase session; same `auth.users` row as password? | _tbd_ | _tbd_ | _tbd_ |
| C · read latency | `context.sync` ms + payload; where the ~5 MB ceiling bites | _tbd_ | _tbd_ | _tbd_ |
| D · interview UX | Highlight an agent-named range + render draft review? | _tbd_ | _tbd_ | _tbd_ |
| E · onChanged | Change capture reliability; the dropdown gap; Local/Remote | _tbd_ | _tbd_ | _tbd_ |

Probe B detail (the hinge), per lane × platform: session yes/no, failure mode, and the resulting `user.id` versus the password account's id.

| Lane | Windows | Mac | Excel on web |
| --- | --- | --- | --- |
| 0 · password | _tbd_ | _tbd_ | _tbd_ |
| A · NAA silent | _tbd_ | _tbd_ | _tbd_ |
| B · dialog | _tbd_ | _tbd_ | _tbd_ |

Design-partner environment facts (from the runbook): Office version/SKU _tbd_, desktop vs web _tbd_, centralized-deployment admin path _tbd_, sideload-blocking tenant policy _tbd_.

## Decision

_To be written from the table._ The decision is one of:

- **GO** if: an SSE transport works (Probe A incremental, or buffered-but-acceptable since the production model is progress not tokens), at least one auth lane yields a Supabase session on the partner's actual platform (Lane 0 always does, so this is really "is a Microsoft lane viable or do we ship Lane 0 + dialog for the pilot"), Probe C latency is acceptable for a realistic workbook, and Probes D/E confirm the interview gestures and capture triggers the design depends on. Merge `feat/m1-pane-spike` to `dev`; cut the M3/M4 pane issues.
- **NO-GO** if a probe returns a blocking result with no workaround (for example: the webview makes the interview UX impossible, or no auth lane works on the partner's platform). Archive the branch; the web app remains the primary surface (revert the ADR-028 direction) and the reason is recorded here.

The identity-linking option falls out of Probe B: same `auth.users` row selects Option (a) LEAN, different rows escalates to Option (b) ([ADR-032](032-identity-linking-schema.md)).

## Consequences

_To be written from the decision._ On GO: the re-scoped pane issue set replaces #31/#32/#33; the pane workload moves from "planned" to "wired" in [../prd/deployment-setup.md](../prd/deployment-setup.md) (done) and gets its custom-domain/TLS requirement onto the Juno agenda; the security packet gains the add-in deployment and pane sandbox section. On NO-GO: ADR-028's primary-surface direction is reversed and the web-first plan resumes.

## Open items

1. Fill the results table from live runs (the runbook).
2. The Outlook second-host timing decision (ADR-028 open item 2), settled here on GO.
3. The production SSE payload (real run state via an `onProgress` callback in `runHermesTask`), deferred to M3.
