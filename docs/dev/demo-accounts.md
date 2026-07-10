# Demo accounts

Fixed, memorable personas for local development and demos, seeded by
`pnpm seed:demo`. The seed is idempotent: run it whenever, existing workspaces
are reused, persona passwords are re-set. All of it is local-only by a hard
guard in the script (refuses unless `APP_ENV` is development/test/unset and the
`SUPABASE_URL` host is `127.0.0.1`/`localhost`).

## Personas

Password for every persona: **`cormac-demo`**.

| Email | Access |
| --- | --- |
| `owner@demo.test` | owner of both workspaces |
| `admin@demo.test` | agent_admin in both workspaces |
| `manager@demo.test` | manager in the Live book |
| `member@demo.test` | member in the Live book |
| `viewer@demo.test` | read_only in the Live book |
| `operator@demo.test` | platform operator only, no workspace memberships |

`operator@demo.test` exercises the Serenica-internal operator surface
(`/api/operator/*`, and the `/operator` console once the web work lands). It is
deliberately not a member of any workspace: the operator tier does not bypass
workspace capability checks, and the seed keeps that visible.

## Workspaces

| Name | Stage | Contents |
| --- | --- | --- |
| `Demo — Getting started` | setup | relationship-crm workbook snapshot, no contract |
| `Demo — Live book` | live | golden relationship-crm contract, ops record book (8 organizations, 12 contacts, planted cases) |

## Commands

```sh
pnpm seed:demo               # seed or refresh, rebind dev vault agent tokens
pnpm seed:demo --no-tokens   # same, but leave agent-token bindings alone
pnpm seed:demo --reset       # purge both demo workspaces and rebuild
```

Requires the local stack (`pnpm db:start`); the script runs under
`infisical run` via the pnpm script. `--reset` purges the two workspaces
through the sanctioned `purge_workspace` path; auth users are kept so persona
user ids stay stable.

## Staging preview accounts (not the demo seed)

The demo seed never runs against staging (the guard above; control register
row 23). For previewing a deployed build wired to staging (the kind smoke, the
Juno substrate work), two kinds of accounts exist on the staging project:

| Email | What it is |
| --- | --- |
| `owner-e2e-*@test.local`, `owner-ops-*@test.local` | created by `seed:authoring-e2e` / `seed:ops-e2e`; random unrecorded passwords (sign-in is not their purpose; agent tokens are) |
| `owner@test.local` | manual convenience account (2026-07-10), password `cormac-kind-demo`, owner of both e2e workspaces, for browser sign-in against a deployed preview |

Staging holds synthetic data only. These are not personas, the smoke script
does not use them, and they should be removed or re-passworded whenever
staging credentials rotate (see the key-rotation runbook).

## Agent-token caveat

There is one live binding per agent kind (the vault token's hash is unique, so
binding it to a workspace moves it). The default `seed:demo` rebinds
`CORMAC_AGENT_TOKEN` to the Getting-started workspace and
`CORMAC_OPS_AGENT_TOKEN` to the Live book, which steals the bindings from any
previously seeded e2e workspace. That is by design: the demo becomes the
workspace the running gateways serve, with no gateway restart. To point the
tokens back at an e2e workspace, rerun `pnpm seed:authoring-e2e` /
`pnpm seed:ops-e2e`; to keep e2e bindings while refreshing the demo, use
`--no-tokens`.

## Render smoke

`tools/e2e/smoke.mjs` signs in as a persona and walks every page at desktop
(1440px) and mobile (390px) width, failing on console errors, blank roots, or
page-level horizontal scroll. It uses the Playwright-cached Chromium headless
shell; nothing leaves the machine.

```sh
node tools/e2e/smoke.mjs                          # owner@demo.test by default
SMOKE_EMAIL=viewer@demo.test node tools/e2e/smoke.mjs
```

Screenshots land in `.jarvis/tmp/notes/render-smoke/shots/` (gitignored).
