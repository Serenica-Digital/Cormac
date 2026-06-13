# Runbook: sideload the pane and run the M1 probes

> **Status:** draft · **Last reviewed:** 2026-06-12

Scripted steps so the observation sessions are short. The goal is to fill the results table in [../adr/030-pane-go-no-go.md](../adr/030-pane-go-no-go.md) with a measured answer for each probe on each platform. Lane 0 (email/password) needs zero Azure and unblocks Probes A, C, D, E immediately; only Probes B's Microsoft lanes need the Entra steps in section 4.

The split (from the plan): the code is built and committed on `feat/m1-pane-spike`. This runbook is the hands/eyes/accounts half. Paste each on-screen readout back into the ADR's results table.

## 1. One-time local setup

```sh
pnpm install
# Trust a localhost HTTPS cert for Office sideloading (writes to ~/.office-addin-dev-certs):
pnpm --filter @cormac/pane certs
# Bring up Supabase + seed the demo workspace/owner (owner@demo.cormac.test):
pnpm db:start && pnpm seed
```

In `.env`, turn the probe route on for the control plane and confirm the pane origin is allowed:

```sh
SSE_PROBE_ENABLED=true
# CORS_ORIGINS default already includes https://localhost:5175; set it explicitly if you overrode it.
```

## 2. Run the stack

Two terminals (the pane dev server runs on the host so it serves real HTTPS from the trusted cert; do not run the pane via Docker for sideloading):

```sh
# Terminal 1: control plane + runtime (Docker)
pnpm dev
# Terminal 2: the pane dev server on https://localhost:5175
pnpm --filter @cormac/pane dev
```

Open `https://localhost:5175/` in a browser first and accept the cert if prompted. The pane should render with "not in Excel" in the header; that confirms the assets and the build before Excel is involved.

## 3. Sideload into Excel (per platform)

The manifest is [../../apps/pane/manifest.xml](../../apps/pane/manifest.xml).

- **Excel on the web (fastest):** open a workbook in the browser → Insert → Add-ins → Upload My Add-in → pick `manifest.xml`.
- **Excel on Windows (WebView2):** put `manifest.xml` in a trusted catalog (a shared folder added under File → Options → Trust Center → Trusted Add-in Catalogs), or use `npx office-addin-debugging start apps/pane/manifest.xml`. Requires a Windows box (Parallels or a cloud VM).
- **Excel on Mac (WKWebView):** copy `manifest.xml` into `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/` and restart Excel, or use the office-addin-debugging command above.

Open the Cormac pane from the Home tab (the "Open Cormac" button) once sideloaded.

## 4. Wire Microsoft sign-in (only for Probe B Lanes A/B)

Skip this section to measure everything except the Microsoft lanes.

1. Create a **sign-in-only** Entra app registration (no Graph permissions): Azure portal → App registrations → New. Add a Single-page application redirect URI `https://localhost:5175/callback.html`. Note the Application (client) ID.
2. In the Supabase dashboard → Authentication → Providers → Azure: enable it, set the client ID and secret, and set the redirect to the Supabase callback. Add `https://localhost:5175/callback.html` to the allowed redirect URLs.
3. Put the client id in `.env`: `VITE_ENTRA_CLIENT_ID=<id>` (and `VITE_ENTRA_AUTHORITY` if not the common endpoint). Restart the pane dev server.
4. In `manifest.xml`, replace the two `PANE_ENTRA_CLIENT_ID` placeholders with the client id, then re-sideload.

## 5. Run the probes and record readouts

In the pane:

- **Probe B (Sign in tab):** sign in with Lane 0 (the seeded owner). Record the `user.id`. Then sign out and sign in with Lane A, then Lane B (after section 4). The panel shows each lane's outcome and, once two lanes succeed, the verdict: same `auth.users` row (Option a) or different (Option b). Record the failure mode for any lane that fails.
- **Probe A (Probes tab):** enter a capture sentence, Run Probe A, read the inter-arrival table. Spaced ~1s deltas on the `progress` rows = incremental; one big gap before `result` = buffered. Record the verdict and the deltas.
- **Probe C:** open a realistic multi-sheet workbook (the design partner's, with synthetic data), Read workbook summary. Record sync count, total ms, approx MB, and any sheet that errors (the read ceiling).
- **Probe D:** type a range (or tap a draft field) and Highlight. Confirm visually that the range highlights and selects in the open sheet. Record yes/no per platform.
- **Probe E:** Start change log, then edit a cell, change a data-validation dropdown, and paste a block. Record which actions fired `onChanged`, the `source` (Local/Remote), and specifically whether the dropdown fired (the known web gap).

## 6. Decide

Fill the results table in the GO/NO-GO ADR from the readouts, write the synthesis, and make the GO/NO-GO call. On GO, merge `feat/m1-pane-spike` to `dev` and cut the re-scoped M3/M4 pane issues. On NO-GO, archive the branch and record why in the ADR.

## Environment facts to capture from the design partner

Needed for the GO/NO-GO and for M3 sequencing: Office version and SKU (Microsoft 365 vs perpetual), Excel desktop vs web usage, the admin path for centralized deployment, and whether the tenant blocks add-in sideloading.
