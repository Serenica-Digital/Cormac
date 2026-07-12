# Juno deploy findings (2026-07-10 / 2026-07-12)

Durable catalog of Juno-platform deployment behavior observed during the stand-up attempt on
2026-07-10 and its 2026-07-12 resumption, so a future agent does not re-derive it. Evidence:
the Codex advisory session `019f4c09` plus its escalated-command approval assessor `019f4c26`
(reviewed 2026-07-12). Reference, do not duplicate, the Juno taxonomy (Orion / Genesis /
Hubble / Kuiper / Terra) in `archive/docs/notes/Juno/` and the v0 record in
`archive/docs/adr/039-terra-packaging-and-juno-platform-reality.md`.

**Evidence quality.** The escalated `git` / `docker` / `kubectl` outputs are trustworthy ground
truth (they were captured through the approval assessor). The Juno UI-state claims (Terra
"Healthy", empty WORKLOADS) are the advisor's reading of owner-pasted screenshots that are not
in the transcript, so they are owner-reported, not independently verified. Marked accordingly
below.

## Bottom line

Cormac's deploy artifacts are sound and portable. The launch is blocked Juno-platform-side, not
by a Cormac gap. The next move is a Juno operator, not more Cormac code.

## Proven locally (the ADR-0003 running-pods bar, met on kind)

Verified via escalated read-only commands:

- Three multi-arch GHCR images `cormac-{control-plane,web,hermes}` with `linux/amd64` present
  (`docker buildx imagetools inspect`).
- Four pods Running on the local `kind-cormac-smoke` cluster (`cormac-control-plane`,
  `cormac-web`, `cormac-hermes-authoring`, `cormac-hermes-ops`) against staging Supabase.

This meets ADR-0003's "proven only from running pods" bar locally. It is not proof on any real
target. The app has never run on Juno.

## Juno-platform blockers (observed)

1. **Terra namespaced application installs "Healthy" but applies zero resources.** The
   `plugins/cormac-preview` Terra namespaced Plugin / Application was added as a private Terra
   Source, appeared as "Cormac Preview Stack", and installed into the `pat` project namespace.
   `kubectl -n pat get deployments,services,configmaps -l app.kubernetes.io/part-of=cormac`
   returned `No resources found` (verified). The install nonetheless reported "Healthy"
   (owner-reported UI). The tenant has no ArgoCD access to inspect or trigger the underlying
   Application sync, so the failure is undebuggable from the tenant side. Root cause unknown:
   either a Juno/Terra to Argo control-plane fault or an undocumented packaging incompatibility.

2. **`runtime-js` source-workload launch fails silently between Hubble and Kuiper.** On
   2026-07-10 the web app rendered in-browser once (after the app-side fixes below). On the
   2026-07-12 resumption, recreating the JS web workload produced no launch: WORKLOADS stayed
   empty, no StatefulSet or pod appeared, and no error surfaced (owner-reported UI). The request
   dies somewhere between Hubble and Kuiper. Unresolved at session end; needs Kuiper controller
   logs, which the tenant cannot read.

3. **Pull-secret-before-workload ordering race.** Image pull failed with
   `401 Unauthorized ... Unable to retrieve some image pull secrets (ghcr-pull)` because the
   `ghcr-pull` and `cormac-secrets` Secrets did not yet exist in `pat`. Both the pull secret and
   the app Secret must exist in the namespace before install, or pods land in
   `ImagePullBackOff` / `CreateContainerConfigError`. This matches archived ADR-039's
   "credentialed Cormac-on-Genesis path remains designed-not-proven".

4. **Tenant RBAC and visibility defaults are too tight to self-serve or debug.** The default K9s
   template (`frank-role`) is `readonly-ns`: get / list / watch only, no create / patch. The K9s
   image ships no `kubectl`. Cluster CRDs are unreadable and there is no ArgoCD access. A
   self-service escalation path did exist for the PAT project: a second K9s template with
   `cluster_access: admin-ns` could be launched (workstation `brenda-0`), `kubectl` installed to
   `$HOME/bin`, and the Secrets created via hidden `read -rsp` prompts (verified created). That
   escalation is a standing-privilege risk and the workstation must be torn down after use.

5. **No ESO plugin in the Juno catalog.** External Secrets Operator is not available as a Juno
   plugin, so the Infisical-to-cluster secret sync used elsewhere in the ADR-0006 posture has no
   in-platform equivalent here. Secrets were materialized by hand instead (see the caveat below).

## App-adaptation quirks for the Juno `runtime-js` path

These are portable fixes already landed on `feat/juno-deploy`; keep them if the `runtime-js`
path is retried:

- **Vite preview must bind `0.0.0.0`.** `pnpm ... preview -- --host` inserted an extra `--`
  separator that made Vite ignore `--host` and bind localhost, so the k8s probe hit
  `connection refused`. Fix: `pnpm ... exec vite preview --host 0.0.0.0`.
- **Host-header allowlist.** Vite rejected the Juno hostname with
  `Blocked request. This host ("pat.juno-innovations.com") is not allowed`. Fix: set
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`.
- **Dynamic base path.** Juno serves each workload under `/polaris/<workload>/` while Vite built
  assets from `/`, causing MIME / subpath load errors. Fix: a portable router change (`5db416b`)
  using Vite's `base` fed by the Juno-injected `$PREFIX`, building and running with
  `--base "$PREFIX"`. No hardcoded workload name.

## Secret-bootstrap procedure and caveat

If the Juno track continues, the observed self-service bootstrap was: launch an `admin-ns` K9s
workstation, install `kubectl` to `$HOME/bin`, create `ghcr-pull` (dockerconfigjson) and
`cormac-secrets` (the five staging keys) via hidden `read -rsp` prompts, then **tear the admin
workstation down**. This procedure belongs in `deploy/juno/README.md` on the branch, not in a
product runbook.

**Security caveat.** This copies staging secrets (`SUPABASE_SERVICE_ROLE_KEY`, `HERMES_API_KEY`,
`ANTHROPIC_API_KEY`, `CORMAC_AGENT_TOKEN`, `CORMAC_OPS_AGENT_TOKEN`) plus a GHCR `read:packages`
PAT onto Juno's shared / spot cluster, whose at-rest encryption we do not control. Treat them as
exposed and fold them into the rotation tracked in #92. Historical plaintext credentials also
live in `archive/docs/notes/Juno/Juno-diagrams/localJuno.md`; treat as compromised, do not reuse.

## Bearing on ADR-0003

ADR-0003 (plain OCI + Helm designed for EKS; Juno is a swappable dev substrate; no Terra
bundles) is not contradicted by this work and is arguably reinforced by it. `plugins/cormac-preview`
vendors the same canonical charts and is explicitly experimental and off `dev`; its own README
says it does not amend ADR-0003 and must not merge to `dev` without that decision. An ADR-0003
amendment to bless the Terra path would be premature: the Terra path has stood up zero pods and
only helm-renders locally. The gate for that amendment is a Terra stand-up that clears the
running-pods bar, which requires the Juno-operator answers above first.
