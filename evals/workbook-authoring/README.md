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
  issues verbatim on failure; backs the profile's `submit_contract` tool.
- `scripts/diff-contracts.ts` — structural stability check across N produced contracts.
  `npm run diff <a.json> <b.json> ...`. Naming variance tolerated, structural variance not.
- `profile/` — source of truth for the `cormac-authoring` Hermes profile (SOUL, interview
  skill, tool scripts, config). `profile/sync.sh` copies it into
  `~/.hermes/profiles/cormac-authoring/`.

## Running an interview

```bash
cd evals/workbook-authoring        # process cwd matters: Hermes file tool resolves here
./profile/sync.sh                  # after any SOUL/skill edit
hermes -p cormac-authoring chat    # human plays the client
```

Over the HTTP path (through the control plane), the gateway launches under the vault
slot: `pnpm agent:hub run` (dev — gpt-5.5 on the Codex plan, cheap iteration) or
`INFISICAL_ENV=staging pnpm agent:hub run` (metered Sonnet 4.6). The profile holds no
`.env`; see `profile/hub.sh` and ADR-0005/0006.

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
