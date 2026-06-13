# ADR-034: Environment and secrets as one governed contract; the Kubernetes deployment shape

**Status:** Accepted (the Juno-specific bindings are provisional pending the onboarding session; see Open items)
**Date:** 2026-06-13
**Related:** Realizes the deployment direction of ADR-017 (Juno as the preferred orchestration platform, kept swappable). Enforces ADR-003/ADR-005 (the service role key is server-only; the runtime holds no database credentials) and refines ADR-020 (JWKS verification) by disabling the HS256 fallback in production. Feeds ADR-015 (the security packet): control-register rows 12 and 29.

## Context

Environment and secrets handling had grown ad hoc, and the Juno (Kubernetes) pilot deployment is near. Two concrete failures exposed the shape of the problem:

- A variable read by the api (`SSE_PROBE_ENABLED`) was documented in `.env.example` and parsed by `config.ts` but never passed through in `docker/compose.yaml`, so the M1 SSE probe route was dead in Docker no matter what `.env` said. Pure drift.
- The api kept a live HS256 token-verification path whose secret defaulted to a string published in this repo (`SUPABASE_JWT_SECRET`). Left at its default in production, anyone who reads the repo could forge an `aud=authenticated` token.

The root cause was the same in both: a variable's existence, type, secret-or-not status, and per-workload wiring were declared independently in four places that drift, with only `apps/api` validating anything at boot:

1. the Zod schema in `apps/api/src/config.ts` (api only),
2. `.env.example`,
3. per-service `environment:` blocks in `docker/compose.yaml`,
4. and soon, Helm charts for Juno.

There were no Kubernetes artifacts at all, and the Juno research record carried a list of "unknown, ask at onboarding" items about secrets and networking that the live public docs could now mostly answer.

## Decision

### 1. One manifest is the source of truth

A single declarative env manifest lives in a new package, `@cormac/config` (`packages/config`). Each variable is declared once with its validation rule (`Z`) and its metadata (`ENV`): scope (`server` | `browser` | `runtime`), `secret`, which workloads read it, whether an operator sets it in `.env`, and its prod fail-closed rule. Nothing about an environment variable is born anywhere else. The api config, the worker, the scripts, and the browser apps all build their schemas from this manifest.

### 2. Every workload validates at boot

`loadServerEnv(workload)` (Node) and `loadBrowserEnv(import.meta.env)` (web/pane) validate against the manifest at startup and fail loud on a missing or malformed value. The api keeps a strongly-typed schema composed from the manifest, bound to it by a test. An empty-string env value is treated as unset, so a compose `${VAR}` that resolves to "" does not trip an optional rule.

### 3. The drift is a CI failure

`scripts/check-env.ts` (`pnpm check:env`, wired into CI) proves the manifest and the three wiring sites agree: `.env.example` documents exactly the operator-set variables; each deployable workload's compose `environment:` block passes through exactly the variables that workload reads, with every secret a `${...}` interpolation; and each workload's Helm chart surfaces its runtime variables, secrets via `secretEnv` (a k8s Secret) and the rest via `env` (a ConfigMap), classified as the manifest says. The `SSE_PROBE_ENABLED` class of bug is now impossible to merge.

### 4. Fail-closed in production

An `APP_ENV` of `dev` or `prod` turns on `enforceProdRules`: the process refuses to boot if `SUPABASE_JWT_SECRET` is the public dev value, if the runtime/MCP credentials are missing, or if `CORS_ORIGINS` is left at the localhost default. Token verification is JWKS-only in prod: the HS256 secret is `null`, so the dev secret cannot forge a token (closes the latent hole; ADR-020). `local` keeps the developer-friendly defaults.

### 5. The Kubernetes consumption model

Secrets are never baked into an image or a chart default. They are injected at runtime via `secretKeyRef` from one k8s Secret; non-secret config rides in a ConfigMap; private images pull with `imagePullSecrets`. The deployment ships as one Helm chart per workload under `deploy/helm/` (Terra workload templates running CI-built images, not Juno's build-from-repo plugins, which do not fit a pnpm monorepo). `clusterip` workloads (worker, hermes-runtime) render a Service and no Ingress, so the platform's `network_mode` feature is not a dependency. The pane carries a stable custom domain plus `cert-manager` TLS; the Hermes runtime carries a memory limit and a CronJob recycler for the upstream leak (#25315). Charts stay plain, portable Kubernetes, so Juno remains swappable (ADR-017).

### 6. Forward-compatible secret backend

The charts consume a plain k8s Secret by `secretKeyRef`, which works whether the cluster ships plain Secrets or an External Secrets Operator syncing from Vault / AWS Secrets Manager / Azure Key Vault (which Juno now advertises). An optional `ExternalSecret` template is provided. Which backend the pilot uses is an onboarding item, but it changes no chart wiring.

## Consequences

- The four declaration sites can no longer drift; adding a variable is a manifest edit that CI forces into `.env.example`, compose, and the charts.
- The repo gains a real, lintable, renderable deployment artifact to bring to the Juno onboarding session, with the unknowns reduced to a short operational ask-list.
- A misconfigured production deploy fails fast and legibly instead of running with a forgeable token or a silently disabled tool surface.
- The Juno-specific values in the charts (the pane host, the `cert-manager` ClusterIssuer name, the recycle image, the secret backend) ride on documented Juno defaults and are marked `PLACEHOLDER`; they are values edits after the onboarding session, not a redesign.

## Alternatives considered

**Just add the missing variable to compose.** Fixes the one symptom, leaves the disease. Rejected: the next variable drifts the same way.

**Generate `.env.example`, compose, and Helm from the manifest.** Cleaner in theory, but generated compose/Helm are less readable and reviewable, and codegen adds a dev-loop step. Rejected in favor of committed, human-readable files that a CI guard checks against the manifest. Generation can come later if drift proves annoying.

**Defer all Helm until after the onboarding session.** Lowest rework risk, but leaves nothing concrete to take to the session and no forcing function for the env contract. Rejected per the explicit choice to build the full deployment now on documented defaults and reconcile after.

**Use Juno's build-from-repo runtime plugins.** They clone a repo and run one build command, which fits single-package repos, not our pnpm monorepo with a build order. Rejected; we deploy CI-built images as our own workload templates.

## Open items

Resolved from the live juno-fx docs/repos on 2026-06-13 (was "unknown" on 2026-06-10): the secret mechanism (k8s Secrets + ESO), `cert-manager` availability for the pane's TLS, that `clusterip` needs no PR-#557 dependency for our own charts, per-workload-only auth, and the pod-to-pod mTLS claim. The residual onboarding confirmations, now operational rather than open-ended:

1. A `cert-manager` `ClusterIssuer` exists and we can delegate DNS for the pane's custom domain (else front it with a CDN).
2. The secret backend on the pilot cluster (plain Secrets vs. an ESO `SecretStore`) and who can read secrets back.
3. The recycle CronJob may hold a Role/RoleBinding to `rollout restart` its Deployment in our namespace.
4. Ingress/cluster hostname stability across platform updates (the api webhook URL, the pane URL).
5. Which Hermes build the pilot runs (whether the post-v0.16.0 leak fix is in).
6. Runtime log-site masking (`redactSensitive` applied everywhere) remains open (#41), tracked against control-register row 13.
