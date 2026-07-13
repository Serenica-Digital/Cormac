---
name: eval-cycle
description: Run one cycle of the agent eval suite and improve on failures — full authority on the dev lane, propose-only everywhere else. Use when the user says "run the evals", "eval cycle", or via "/loop /eval-cycle" for the recurring self-improvement loop. Runs pnpm evals, judges soft criteria, plays interview scenarios as the client, fixes failures on an eval-loop branch, and maintains one PR with before/after evidence.
---

# eval-cycle

One cycle of the agent test suite with a self-improvement pass. The suite and its
rules live in `evals/` (scenarios, harness, baselines — see `evals/README.md`).
Everything here runs the **dev lane** (ADR-0007): gpt-5.5 on the flat-rate plan,
never billable evidence.

## Guardrails (binding; read before every cycle)

1. **Dev lane only.** Never launch a staging/metered gateway, never touch
   `ANTHROPIC_API_KEY`, never update VERDICT.md, any ADR, `ops-seam-findings.md`,
   or any claim marked metered. Agent-profile text you change is dev-lane-improved
   text: label it "pending metered re-proof (#76)" in the PR.
2. **Never merge.** All work goes on the cycle branch (`eval-loop/<yyyy-mm-dd>`),
   pushed, with ONE open PR per branch. `dev` moves only by human review.
3. **Posture scenarios are loop-invariant** (`"loopInvariant": true`). If one
   fails, you may fix the *profile back to the locked posture* (re-run setup.sh)
   or fix the scenario's parsing — you may NEVER relax the posture, weaken the
   assertion, or delete the scenario. If the posture itself seems wrong, STOP the
   loop and report; that is an ADR-0008 question for the owner.
4. **Thrash caps.** At most 2 fix attempts per failing scenario per cycle. Still
   failing → record the diagnosis in the cycle report and move on. A scenario
   that flip-flops across cycles gets `"quarantined": true` added (stays visible,
   stops gating) plus a filed tracker issue — never deleted.
5. **Baselines move deliberately.** Update `evals/baselines/<id>.json` only for an
   explained change (a fix you verified, or a new scenario's first accepted run),
   in its own commit.
6. **Local dev stack only.** You may start/restart local Supabase, the dev control
   plane, and the two dev-lane gateways. Nothing else.

## Division of labor (the execution model)

You are the ORCHESTRATOR. Scripts do the deterministic work; subagents do the
model-judgment work; your context holds conclusions, never transcripts.

- **Script** (`pnpm evals`): seeding, driving, evidence collection, machine
  assertions, budgets. Never re-derive what it graded.
- **Subagents** (the Agent tool; run independent ones in parallel, in one
  message): interview player-judges, soft-criteria judges, scoped fixers.
  Capture scenarios stay serial through the script — the ops gateway binds one
  workspace token at a time (ADR-0005); parallel capture arrives with
  per-workspace gateway pairs (ADR-0016), not by agent fan-out here.
- Playing an interview or reading full evidence bundles in YOUR context is a
  bug in the cycle (it burns the orchestrator's context on disposable work).

## The cycle

1. **Preflight (you, inline).** Stack up: `pnpm db:start` if needed; control
   plane (`pnpm cp:dev` with `HERMES_AUTHORING_URL=http://127.0.0.1:8644` and
   `HERMES_OPS_URL=http://127.0.0.1:8645` in the environment, or `cp:dev:ops`
   for ops-only work); gateways `pnpm agent:hub run` (8644) and
   `pnpm ops:hub run` (8645); `evals/*/profile/sync.sh` after any profile edit.
2. **Run (script).** `pnpm evals` (add `--only`/`--kind` when iterating).
   Exit 2 = infra: fix the stack, not the scenarios. Read only the report JSON.
3. **Fan out the judgment work (subagents, one parallel batch).**
   - **Per interview scenario, one player-judge agent.** Its prompt carries:
     the persona file path (it must answer ONLY from that ground truth, stay in
     character, respect scripted beats), the seed command
     (`pnpm seed:authoring-e2e`), the turn driver
     (`infisical run --env=dev -- evals/workbook-authoring/scripts/send-turn.sh
     <unique-conversation> "<msg>"`), the scenario's `maxTurns` cap and
     `budget.maxInterviewTurns`, the gates to run after publish
     (`npm run validate <contract>`, `npm run diff <contract> <golden>` from
     `evals/workbook-authoring/`), and the scenario's judge criteria. It
     returns a compact verdict: turns used, gate results, per-criterion
     PASS/FAIL with one sentence each, and the three most instructive
     transcript moments. **A turn-budget breach FAILS the scenario even when
     the contract is valid** — the owner's standard: no question ping-pong;
     draft from the workbook, confirm in batches.
   - **One judge agent per 4-6 capture scenarios with `judge` criteria**,
     reading their `.evidence.json` files and returning per-criterion verdicts
     with one-line reasoning. Judge grades never override machine grades.
4. **Improve.** Diagnose each FAIL/regression from the returned verdicts (pull
   evidence details only as needed). Fix at the right layer: agent profile
   text (`evals/*/profile/`, then re-`sync.sh`), scenario bug, or harness bug.
   Scoped fixes may go to a fixer subagent with an exact brief; you review its
   diff before committing. Cadence fixes belong in the interview skill
   (`evals/workbook-authoring/profile/skills/interview/SKILL.md`) — check
   PR #110 (cadence retune) first so the loop never forks a competing fix of
   the same file. Branch `eval-loop/<yyyy-mm-dd>` off dev (reuse if it
   exists), one commit per verified fix, message carries before/after grades.
   Re-run only the affected scenarios (`--only`; interviews re-play via a
   fresh player agent), then a full `pnpm evals` before closing.
5. **Close.** Write the cycle report to
   `.jarvis/tmp/notes/eval-runs/cycle-<stamp>.md` (machine summary, judge
   verdicts, interview verdicts, fixes made, diagnoses parked, baseline
   changes). Push the branch; open or update the PR (title "Eval loop:
   <date>") with the report inline. If invoked under `/loop`, schedule the
   next wake-up (30-60 min while actively fixing, several hours when green);
   otherwise end with the summary.

## Success shape

A green cycle = machine PASS everywhere, judge criteria PASS, interviews publish
valid + stable + well-judged, zero regressions vs baselines. The loop's product is
the PR: small verified improvements to agent profiles and scenarios, with evidence,
waiting for human review and the #76 metered pass.
