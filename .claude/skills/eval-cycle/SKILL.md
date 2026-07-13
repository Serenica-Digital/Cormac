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

## The cycle

1. **Preflight.** Stack up: `pnpm db:start` if needed; control plane
   (`pnpm cp:dev` with `HERMES_AUTHORING_URL=http://127.0.0.1:8644` and
   `HERMES_OPS_URL=http://127.0.0.1:8645` in the environment, or `cp:dev:ops` for
   ops-only work); gateways `pnpm agent:hub run` (8644) and `pnpm ops:hub run`
   (8645); `evals/*/profile/sync.sh` after any profile edit; seed manifests exist
   (`pnpm seed:ops-e2e` / `pnpm seed:authoring-e2e` only when missing or stale —
   the runner seeds per-scenario workspaces itself).
2. **Run.** `pnpm evals` (add `--only`/`--kind` when iterating). Exit 2 = infra:
   fix the stack, not the scenarios. Read the report JSON it prints.
3. **Judge.** For every graded scenario with `judge` criteria, read its
   `.evidence.json` in the run directory and grade each criterion PASS/FAIL with
   one sentence of reasoning. Judge grades never override machine grades; record
   them in the cycle report.
4. **Play the interviews.** For each `interview` scenario (reported MANUAL):
   read its persona file and BE that client. Seed with `pnpm seed:authoring-e2e`,
   then drive turns with `evals/workbook-authoring/scripts/send-turn.sh
   <conversation> "<your message>"` — answer only from the persona's ground
   truth, stay in character, respect its scripted beats. Stop at publish or the
   scenario's `maxTurns`. Then run the gates:
   `npm run validate <produced contract>` and `npm run diff <produced> <golden>`
   (from `evals/workbook-authoring/`), and judge the scenario's criteria from the
   transcript. **Count the client turns to publish and grade them against
   `budget.maxInterviewTurns` — a turn-budget breach FAILS the scenario even
   when the contract is valid.** The owner's standard: a client should never
   sit through question ping-pong; the skill must draft from the workbook and
   confirm in batches. Cadence fixes belong in the interview skill
   (`evals/workbook-authoring/profile/skills/interview/SKILL.md`) — and check
   PR #110 (cadence retune) first so the loop never forks a competing fix of
   the same file. Record everything in the cycle report.
5. **Improve.** For each FAIL/regression, diagnose from evidence, then fix at the
   right layer: agent profile text (`evals/*/profile/`, then re-`sync.sh`),
   scenario bug (wrong expectation), or harness bug. Branch
   `eval-loop/<yyyy-mm-dd>` off dev (reuse if it exists), one commit per verified
   fix, message carries before/after grades. Re-run only the affected scenarios
   (`--only`), then a full `pnpm evals` before closing the cycle.
6. **Close.** Write the cycle report to
   `.jarvis/tmp/notes/eval-runs/cycle-<stamp>.md` (machine summary, judge grades,
   interview verdicts, fixes made, diagnoses parked, baseline changes). Push the
   branch; open or update the PR (title "Eval loop: <date>") with the report
   inline. If invoked under `/loop`, schedule the next wake-up (30-60 min while
   actively fixing, several hours when green); otherwise end with the summary.

## Success shape

A green cycle = machine PASS everywhere, judge criteria PASS, interviews publish
valid + stable + well-judged, zero regressions vs baselines. The loop's product is
the PR: small verified improvements to agent profiles and scenarios, with evidence,
waiting for human review and the #76 metered pass.
