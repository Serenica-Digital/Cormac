# Runbook: sideload the pane and run the M1 probes

> **Status:** draft · **Last reviewed:** 2026-06-14

Scripted steps so the observation sessions are short. The goal is to fill the results table in [../adr/030-pane-go-no-go.md](../adr/030-pane-go-no-go.md) with a measured answer for each probe on each platform. Lane 0 (email/password) needs zero Azure and unblocks Probes A, C, D, E immediately; only Probes B's Microsoft lanes need the Entra steps in section 4.

The split (from the plan): the code is built and committed on `feat/m1-pane-spike`. This runbook is the hands/eyes/accounts half. Paste each on-screen readout back into the ADR's results table.

## 1. One-time local setup

Secret and config values come from Infisical, not a `.env` (ADR-037), so log in once:

```sh
pnpm install
infisical login                                  # one-time; injects env for the commands below
# Trust a localhost HTTPS cert for Office sideloading (writes to ~/.office-addin-dev-certs):
pnpm --filter @cormac/pane certs
# Seed the demo workspace/owner on the managed dev Supabase (owner@demo.cormac.test):
pnpm seed
```

The SSE probe route is on in the local overlay ([../../plugins/api/values.local.yaml](../../plugins/api/values.local.yaml): `SSE_PROBE_ENABLED=true`), which also allows the pane origin via `CORS_ORIGINS`. Override either in Infisical's `dev` environment only if you need to.

## 2. Run the stack

The backend runs in local k3d (the Helm charts); the pane dev server runs on the host so it serves real HTTPS from the trusted cert (do not run the pane in-cluster for sideloading):

```sh
# Terminal 1: control plane + runtime in k3d, then expose the api to the host
pnpm dev                                         # scripts/k3d/up.sh: builds + installs the charts
kubectl -n cormac port-forward svc/cormac-api 8088:8088
# Terminal 2: the pane dev server on https://localhost:5175 (env from Infisical)
pnpm --filter @cormac/pane dev
```

Open `https://localhost:5175/` in a browser first and accept the cert if prompted. The pane should render with "not in Excel" in the header; that confirms the assets and the build before Excel is involved.

### Verify the backend posture before sideloading

The pane signs into **managed** Supabase and presents an ES256 token, so the api must run in the managed/`dev` posture (not the local/CI posture) and the managed schema must be current, or every probe fails at the door. Check both first (ADR-030 "Environment readiness" carries the fixes):

```sh
# Expect APP_ENV=dev against the managed project. APP_ENV=local / host.k3d.internal:54321
# means the api is in the CI posture and will reject the pane's managed token.
kubectl -n cormac get configmap cormac-api-config -o jsonpath='{.data.APP_ENV}{"  "}{.data.SUPABASE_URL}{"\n"}'
# Managed schema must include learned_knowledge (migration 0007); if missing, capture
# fails in compileWorkspaceContext. Push migrations with: pnpm db:push:managed
```

## 3. Sideload into Excel (per platform)

The manifest is [../../apps/pane/manifest.xml](../../apps/pane/manifest.xml).

- **Excel on the web (fastest):** open a workbook in the browser → Insert → Add-ins → Upload My Add-in → pick `manifest.xml`.
- **Excel on Windows (WebView2):** put `manifest.xml` in a trusted catalog (a shared folder added under File → Options → Trust Center → Trusted Add-in Catalogs), or use `npx office-addin-debugging start apps/pane/manifest.xml`. Requires a Windows box (Parallels or a cloud VM).
- **Excel on Mac (WKWebView):** Excel for Mac desktop has **no "Upload My Add-in" UI** (that entry is Windows + web only), so sideload by placing the manifest in the per-user `wef` folder. Use the script:

  ```sh
  pnpm --filter @cormac/pane sideload:mac   # copies manifest.xml into the Excel wef container
  # then FULLY quit Excel (Cmd-Q, not just close the window) and reopen
  ```

  After reopening, the **Open Cormac** button is on the **Home** tab; click it to open the pane. `pnpm --filter @cormac/pane sideload:mac:stop` removes the manifest. The container path is `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/` (verified on the Microsoft 365 installer build **Excel 16.109.3**; on other builds confirm with `ls ~/Library/Containers | grep -i excel`). Two preconditions: the pane dev server (`pnpm --filter @cormac/pane dev`) is running, and `https://localhost:5175` loads cleanly in **Safari first** (WKWebView shares Safari's trust store; a TLS error there means the dev cert is not trusted, not a pane bug). `office-addin-debugging start apps/pane/manifest.xml desktop` also sideloads on Mac, but it calls Microsoft's hosted manifest validator, which can return 502; the `wef` copy depends on nothing external.

Open the Cormac pane from the Home tab (the "Open Cormac" button) once sideloaded.

## 4. Wire Microsoft sign-in (only for Probe B Lanes A/B)

Skip this section to measure everything except the Microsoft lanes.

1. Create a **sign-in-only** Entra app registration (no Graph permissions): Azure portal → App registrations → New. Add a Single-page application redirect URI `https://localhost:5175/callback.html`. Note the Application (client) ID.
2. In the Supabase dashboard → Authentication → Providers → Azure: enable it, set the client ID and secret, and set the redirect to the Supabase callback. Add `https://localhost:5175/callback.html` to the allowed redirect URLs.
3. Put the client id in Infisical's `dev` environment: `VITE_ENTRA_CLIENT_ID=<id>` (and `VITE_ENTRA_AUTHORITY` if not the common endpoint). Restart the pane dev server (`infisical run -- vite` picks it up).
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
