# ADR-030: Excel task pane GO/NO-GO (M1 spike result)

**Status:** Proposed (skeleton; the decision is taken once the M1 results table below is filled from live runs on Windows, Mac, and Excel-on-web)
**Date:** 2026-06-12
**Related:** The follow-up status ADR that ADR-028 gated the pane build on ("the follow-up status ADR records the GO/NO-GO and the re-scoped issue set"). Closes #52 and folds #31/#32/#33. Reads against the design ADRs [ADR-031](031-pane-architecture-and-sign-in-lanes.md) (pane architecture and sign-in lanes) and [ADR-032](032-identity-linking-schema.md) (identity linking), measured via [../runbooks/pane-sideload.md](../runbooks/pane-sideload.md). Evidence base: the research phase [../research/microsoft-ecosystem-integration.md](../research/microsoft-ecosystem-integration.md).

## Context

ADR-028 accepted the Excel task pane as the primary client surface as a direction and gated the build on a measurement spike, because several platform constraints are only trustworthy when exercised in real Excel. M1 built a minimal, instrumented `apps/pane` plus one new control-plane SSE route, both on `feat/m1-pane-spike`, merged to `dev` via PR #54 ahead of this call (a recorded deviation from holding until GO; the probes run from `dev`). This ADR records the result and re-scopes the pane issue set.

Two research findings shaped the spike and bound this decision:

- **Hermes returns only a terminal result; there is no token stream.** So pane "streaming" is progress streaming. Probe A proves only that an SSE transport survives the webview; the production token story is out of scope for the decision.
- **Silent Microsoft sign-in is doubly unproven** (Supabase id-token nonce/audience rejection; the NAA Mac WKWebView abort). Lane A is a measure-it question; Lane B (dialog) is the documented fallback; Lane 0 (email/password) works in-pane today and unblocks the rest.

## Server-half precheck (executor, 2026-06-14)

Run before any human opens Excel, to keep Probe A a pure question about the webview. Method: the control-plane api was run on the host against the **managed** dev project (the posture the pane uses), a real owner session token was minted from managed Supabase by password grant, and the SSE route was streamed with `curl -N` and per-frame arrival timestamps.

- **Auth path sound.** The managed-issued **ES256** owner token (iss `…/auth/v1`, `aud=authenticated`) is accepted by the route's authz chain (`authenticate` + `requireCapability('capture_update')`). This is the same path the pane uses, so Probe A/B do not start blocked on the server.
- **The server does not buffer to one terminal write.** `received` and `progress{tick:0}` flush immediately on open; the terminal frames arrive in a *separate, later* network write (`reply.hijack()` + `setNoDelay` + `no-transform` hold). So if a platform's webview shows a single end-of-stream burst, that is the **webview** coalescing, not the server.
- **Not yet shown: the sustained ~1s tick train.** The capture still errors before the multi-second runtime call that would emit the spaced ticks, now on the pre-glossary contract render bug (#60), not the SSE path. Re-run after #60 to capture the tick train and make Probe A conclusive (spaced ticks vs an end burst). This is a capture-pipeline gap, not an SSE-transport defect.

## Environment readiness (clear before the observation session)

The spike code was green, but on `dev` @ 194c4b9 the running backend could **not** serve a pane probe. Four gaps were found; each also showed the "proven managed posture" of ADR-037/038 was not reproducible from the committed tree (the live cluster ran pre-fix artifacts). The first three are fixed (2026-06-14); the fourth is filed.

1. **The live k3d api was in the local/CI posture, not managed/dev.** The `cormac-api` ConfigMap pinned `APP_ENV=local` + `host.k3d.internal:54321`, so it rejected the managed ES256 tokens the pane mints. Root cause: the ESO `ExternalSecret` had been in `SecretSyncedError` for 13h because the *live* spec mapped `SUPABASE_JWT_SECRET` (absent from Infisical `dev` by design, JWKS-only), so `cormac-secrets` was frozen on stale values; the committed `externalsecret.yaml` was already correct but never re-applied. **Resolved:** re-applied the committed ESO artifacts (sync green, `cormac-secrets` now holds the managed values) and rolled the api to `APP_ENV=dev`.
2. **`deploy/helm/api/values.local.yaml` could not reach managed as committed** — `SUPABASE_URL`/`SUPABASE_ANON_KEY` were unfilled `SET ME` placeholders. **Resolved:** filled with the managed dev URL + publishable anon key (non-secret; `check:secrets`/`check:env` clean) and `helm upgrade`d the api. ConfigMap now `APP_ENV=dev` against the managed project, `SSE_PROBE_ENABLED=true`; the api boots clean (0 restarts) and accepts a managed ES256 owner token, so the Probe B precondition holds.
3. **The managed dev schema was stale** (tables only through migration 0004; `0005`/`0006`/`0007` unapplied, so no `learned_knowledge`). **Resolved:** `pnpm db:push:managed` applied 0005-0007; `learned_knowledge` is live.
4. **Pre-glossary contracts crash the context compile (#60).** With the schema current, capture now fails in `renderGlossary` because the seeded managed contract predates the glossary and `getActiveContract` casts the stored document instead of parsing it through `contractSchema` (which would apply `glossary: .default([])`). This blocks a *successful* capture and so a *conclusive* Probe A until #60 lands. Probes B/C/D/E and the SSE transport itself are unaffected.

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
