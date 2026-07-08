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

> 2026-07-08: the three patches are applied and re-proven metered (below). The
> human-played run is deferred by the owner until an interview UI exists; it remains
> the gate before any design-partner session.

## Hardened-profile re-proof — 2026-07-08 (metered Sonnet, ADR-0007 mixed mode)

One agent-played interview on the PR #75 profile: typed plugin tools (`read_workbook`,
`submit_contract` over `/agent/*`), no terminal, curator/memory off, skill patches
applied. Full product path: human JWT → `/authoring/turn` → gateway → plugin tools →
publish gate. Same fixture, same client persona.

| Run | Turns | Valid | Tool calls | Cost | Cache |
|-----|-------|-------|------------|------|-------|
| hardened-1 | 9 | first submit | exactly 2 (`read_workbook`, `submit_contract`) | ~$0.12 | 87% overall, 96–99% steady-state |

- **Validity: PASS.** First-submit valid through the real gate; repair loop never fired.
  `contract_versions` v1 active, `parseContract` valid, 3 objects.
- **Economics: ~4x under the spike baseline** (~$0.12 vs ~$0.50). The lockdown removed
  the default toolset schemas from every call (~17–20k input tokens/call in the spike,
  ~8.6–12.7k now); Anthropic cache-read pricing does the rest. 86k input tokens total,
  10.6k uncached, 4.5k output.
- **Patches, honestly graded:** closed-set→enum held (`relationship_lead` enum
  `["Avi","Dana"]` on all objects; free-form coverage correctly left `string`). The
  lifecycle probe fired once (operators) and generalized from the client's "no stages"
  pushback rather than re-asking per object — defensible conversationally, short of the
  skill's per-object letter. The full review checkpoint ran unprompted; a last-minute
  client correction (sport → "Sport or League") was applied correctly in the published
  contract but submitted without the re-recap the skill requires, under "call in five"
  pressure. Both deviations are elicitation-sharpness, not validity or trust-rule
  failures.
- **Notably strong:** the agent caught that capital partners are firm-first identity
  (reversed from the other objects) and elicited it; flagged the combined-names row as a
  glossary entry instead of inventing records.
- **Hardening held:** installed skill byte-identical to tracked source after the run;
  no staged skill writes.
