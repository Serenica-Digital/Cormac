# Spike #64 verdict: GO

Decision record: `.jarvis/adr/0004`. Reusable findings:
`.jarvis/research/authoring-spike-findings.md`. This file is the spike-local evidence
summary.

## The bet

An authoring agent can conduct a consultative interview over a real workbook and produce
a valid, stable, published contract. v0 proved one-shot authoring cannot (invalid every
run, three runs three data models).

## Evidence

Three agent-played interview runs on the real fixture (`relationship-crm`), fixed client
persona (`.jarvis/tmp/notes/authoring-runs/client-persona.md`), all over `/v1/responses`
named conversations per ADR-0001. Contracts and per-run judgment notes in
`.jarvis/tmp/notes/authoring-runs/`.

| Run | Turns | Valid | Submit path | Cost | Notes |
|-----|-------|-------|-------------|------|-------|
| 1 | 13 | first submit | agent terminal | ~$1.00 (2 cache-cold restarts) | profile v1; asked the status question |
| 2 | 16 | first submit | manual (terminal regression, root-caused) | ~$0.26 (truncated) | profile v2; sensitivity + identity fixes landed |
| 3 | 15 | first submit | agent terminal | ~$0.50 (clean) | profile v2; skipped final review under time pressure |

- **Criterion 1, validity: PASS 3/3.** Schema-valid on first submit every run; the
  repair loop was never exercised.
- **Criterion 2, stability: PASS.** Identical objects, orientation, and field types
  across all runs (`scripts/diff-contracts.ts`, naming normalized). Residual variance:
  `status` enum only in the run that asked; relationship lead enum vs string. Both trace
  to discretionary elicitation, both have skill-level fixes.
- **Criterion 3, consultative feel: agent-played evidence only** (owner waived the human
  run for this verdict). Consistent across runs: workbook read before greeting, planted
  ambiguities surfaced unprompted, checkpoints held, plain language throughout, graceful
  handling of a direct correction. A human-played run is required before any
  design-partner session.

## What broke (all root-caused, all fixed)

- sync.sh overwrote Hermes-owned config.yaml, reverting the api_server terminal enable;
  run 2's submit stalled on approval-gated execute_code. Fix: config untracked,
  `profile/setup.sh` owns settings idempotently.
- claude.ai subscription quota died mid-run-1; metered `ANTHROPIC_API_KEY` in the
  profile `.env` fixed it and named-conversation state survived the swap.

## What #66 must provide

- The real bindings behind the tool interfaces: `read_workbook` becomes a control-plane
  read; `submit_contract` becomes the contract publish gate. Names and shapes already
  match; the swap must not touch SOUL or the skill.
- Run-lifecycle ownership: start conversations, drive `/v1/responses`, manage profile
  config (terminal per-platform, toolset freeze at session start) as deploy-time facts.
- The operations-agent data-access decision and the ops-vs-authoring privilege split.

## Before production interviews

Apply the three skill patches (mandatory per-object probe list with a states/stages
question; closed-set-to-enum encoding rule; non-skippable final review) and run one
human-played interview.
