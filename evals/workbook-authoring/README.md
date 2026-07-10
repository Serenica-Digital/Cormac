# Workbook authoring spike (#64)

The keystone spike: a Hermes profile (`cormac-authoring`) runs the consultative contract
interview over a real workbook fixture until it produces a valid, stable, published
contract. Brief: `.jarvis/tmp/plans/spike-64-authoring-agent.md`. Gate: ADR-0002.

## Layout

- The contract meta-schema (Zod) and `parseContract` live in `packages/contract`
  (`@cormac/contract`), moved there from this workspace's `src/` in #66 phase 2. Ported
  from v0 (`archive/packages/contract/src/contract.ts`); code unchanged below the header.
- `fixture/*.detected.json` — workbook detection profiles (sheets, headers, inferred
  types, sample rows). `relationship-crm` is anonymized from a real client workbook and
  is the primary fixture; it broke v0's one-shot authoring. `contacts-deals` is synthetic.
- `golden/*.contract.json` — one defensible contract reading per fixture, reference only.
  The GO criteria are validity + stability + consultative feel, not golden match.
- `scripts/validate-contract.ts` — schema gate. `npm run validate <file|->`. Prints Zod
  issues verbatim on failure; the same gate the control plane runs behind `submit_contract`.
- `scripts/diff-contracts.ts` — structural stability check across N produced contracts.
  `npm run diff <a.json> <b.json> ...`. Naming variance tolerated, structural variance not.
- The agent definition lives at `agents/authoring/`: source of truth for the
  `cormac-authoring` Hermes profile (SOUL, interview skill, hardening config) plus the
  plugin tool surface (`read_workbook`, `submit_contract` as typed plugin tools calling
  the control plane's `/agent/*`, ADR-0008). `agents/authoring/sync.sh` copies it into
  `~/.hermes/profiles/cormac-authoring/`.

## Running an interview

The tools are HTTP-only (typed plugin over `/agent/*`), so an interview requires a running
control plane and a gateway launched under the vault slot (which injects
`CORMAC_CONTROL_PLANE_URL` + `CORMAC_AGENT_TOKEN`). There is no offline/fixture path and no
`hermes … chat` shortcut with working tools.

```bash
cd evals/workbook-authoring        # process cwd matters: Hermes resolves relative paths here
../../agents/authoring/sync.sh     # after any SOUL/skill/plugin edit
../../agents/authoring/setup.sh    # idempotent; applies the hardened tool + config posture
pnpm agent:hub run                 # dev — gpt-5.5 on the Codex plan (cheap iteration)
# then drive turns against the gateway:
./scripts/send-turn.sh <conversation-name> "<client message>"
```

Use `INFISICAL_ENV=staging pnpm agent:hub run` for the metered Sonnet 4.6 lane (evidence
only). The human-played interview runs the same gateway path (not `chat`), so it exercises
the hardened `api_server` surface. The profile holds no `.env`; see `agents/authoring/hub.sh` and
ADR-0005/0006/0007.

**Evidence rule:** cost, verdict, and interview-behavior evidence comes from metered
(`staging`, Sonnet) runs only. Dev-slot runs are a different model on the Codex plan —
good for plumbing, harness, and skill-mechanics iteration; they never update VERDICT.md
or ADR claims.

Produced contracts and per-run judgment notes land in
`.jarvis/tmp/notes/authoring-runs/` (gitignored scratch). Between runs:

```bash
npm run validate .jarvis/tmp/notes/authoring-runs/<run>/contract.json
npm run diff <run1>/contract.json <run2>/contract.json <run3>/contract.json
```
