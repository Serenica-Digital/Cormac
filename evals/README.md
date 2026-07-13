# The agent eval suite

Scenario-driven tests for everything the agents do, machine-graded where a machine can
judge and judge-graded where it can't, with tracked baselines so regressions are
explicit — and a self-improvement loop that runs it recurringly
(`.claude/skills/eval-cycle/SKILL.md`, `/loop /eval-cycle`).

This suite complements, never replaces, the vitest integration suite (`pnpm test`):
vitest proves the pipeline's gates; this suite proves the AGENTS' behavior through the
real product path (control plane → gateway → typed tools → held proposals).

## Layout

- `scenarios/*.json` — the tracked suite content. Three kinds: `capture` (utterances +
  pipeline actions, machine assertions, budgets), `interview` (persona-played, gated by
  the validate/diff scripts, judge-graded), `posture` (locked-profile checks;
  **loop-invariant** — never "fixed" by relaxing the posture).
- `harness/` — `runner.ts` (fresh workspace per scenario, evidence bundles incl.
  gateway cache/tool counts), `grade.ts` (assertions, budgets, baseline comparison),
  `types.ts` (the scenario format).
- `baselines/*.json` — last accepted grade per scenario. Updated deliberately (by the
  eval-cycle loop or a human), never by the runner.
- `workbook-authoring/personas/` — tracked client personas the interview player follows.
- `ops-capture/`, `workbook-authoring/` — the original per-agent eval assets (profiles,
  plugins, fixtures, goldens, protocol); the suite builds on them.

## Running

```bash
pnpm db:start                      # local stack
pnpm ops:hub run                   # ops gateway :8645 (dev lane)
pnpm agent:hub run                 # authoring gateway :8644 (only for interviews)
HERMES_AUTHORING_URL=http://127.0.0.1:8644 HERMES_OPS_URL=http://127.0.0.1:8645 \
  infisical run --env=dev -- pnpm --filter @cormac/control-plane dev

pnpm evals                                  # everything
pnpm evals -- --kind capture                # one kind
pnpm evals -- --only learning-loop          # one scenario
```

Exit codes: 0 = all PASS/MANUAL, 1 = failures, 2 = infrastructure not up (a distinct
state on purpose: a down gateway is never a red scenario). Run artifacts land in
`.jarvis/tmp/notes/eval-runs/` (gitignored scratch); scenarios and baselines are the
tracked truth.

Interview scenarios report MANUAL under a headless run: they are played by the
eval-cycle session (the client-player), then gated with the existing
`workbook-authoring` scripts (`npm run validate`, `npm run diff`).

**Evidence rule (ADR-0007, binding):** everything here is dev-lane (gpt-5.5, flat
rate). Budgets at the top level are dev-lane sanity bounds; the `metered` budget block
is only enforced with `--lane metered`, and behavior/cost claims still come only from
metered Sonnet runs. The suite improves the agents; it does not certify them.
