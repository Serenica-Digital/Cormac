# Ops capture eval (#66 phase 6)

The operations data-access seam decision, run as a live eval: the ops agent processes the
fixed utterance protocol through the real product path, holding proposals through the real
gate. Closes the seam ADR-0001/0004 left open for the operations agent. Verdict and
evidence: `.jarvis/adr/0008-*` and `.jarvis/research/ops-seam-findings.md`.

## The shape under test

Typed profile tools, no shell. The agent's three tools (`search_records`, `get_record`,
`submit_proposal`) are the **cormac-ops plugin** (`plugin/cormac-ops/`, installed
per-profile by `profile/sync.sh` so only this profile's gateway loads it), Python handlers
making stateless HTTP calls to the control plane's `/agent/*` surface with the
workspace-scoped operations token (ADR-0005). The profile's tool surface on the
API-server platform is exactly that toolset: no terminal, no files, no web, no browser, no
memory, curator off (`profile/setup.sh`). The contract rides the compiled prompt
(`instructions` seam); capture runs ride `/v1/runs` (ADR-0001).

## Layout

- `plugin/cormac-ops/` — tracked source of the plugin (manifest + three tool handlers).
- `profile/` — tracked source of the `cormac-operations` Hermes profile. `SOUL.md` carries
  the whole procedure (no skills dir on purpose: the skills mechanism needs the skills
  toolset, which includes agent self-editing via `skill_manage`). `sync.sh` installs the
  SOUL and the plugin into the profile, `setup.sh` owns config, `hub.sh` launches the
  gateway (port 8645).
- `utterances.json` — the fixed 8-utterance protocol, one per outcome class: clean create,
  update by name, ambiguous target, alias + enum flip, out-of-contract, multi-change,
  human-only field, read-then-update.
- `scripts/run-batch.ts` — drives the protocol through `POST /api/.../capture` as the
  seeded owner and records outcomes to `.jarvis/tmp/notes/ops-runs/` (gitignored scratch).
  The harness records; the human judges against the expectations in utterances.json.

## Running it

```bash
pnpm db:start                                     # local stack (ADR-0006 dev tier)
pnpm seed:ops-e2e                                 # workspace + contract + 20 records + ops token
infisical run --env=dev -- pnpm exec tsx apps/control-plane/src/index.ts   # control plane up
pnpm ops:hub run                                  # dev lane gateway (Codex gpt-5.5, port 8645)
pnpm ops:batch -- --label dev-smoke               # the protocol
```

The control plane must point `HERMES_URL` at the ops gateway (`:8645`) for capture runs.
Metered evidence lane (ADR-0007): `INFISICAL_ENV=staging pnpm ops:hub run` (staging
gateway, Sonnet) with the dev control plane and dev data — the sanctioned mixed mode.

**Evidence rule (ADR-0007, binding):** cost, verdict, and behavior evidence comes from
metered (`staging`, Sonnet) runs only. Dev-slot runs are a different model on the Codex
plan — good for plumbing and harness iteration; they never update VERDICT-grade claims,
`ops-seam-findings.md`, or the ADR.

Tool-call counts and the cache split are not in the harness output; read the gateway log
(`cache=X/Y` lines), same as the authoring spike.
