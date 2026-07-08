# 0004 — Keystone spike GO; bundled profile tools settle authoring data access

- **Status:** Accepted (2026-07-07)
- **Amends:** ADR-0001 (closes its OPEN seam for the authoring agent; the operations
  half stays open)
- **Satisfies:** the ADR-0002 gate

## Context

The #64 keystone spike ran to completion on 2026-07-07: a `cormac-authoring` Hermes
profile (SOUL, interview skill, two bundled tool scripts) conducted three full
consultative interviews over the real fixture (the anonymized advisory-firm relationship
tracker, `relationship-crm`; the synthetic real-estate fixture went unused). All runs
were agent-played against a fixed client persona; the owner waived the human-played run
for this verdict. Evidence lives in `evals/workbook-authoring/VERDICT.md` and
`.jarvis/research/authoring-spike-findings.md`.

Verified results:

- **Validity 3/3.** Every run produced a schema-valid contract on first submit. The
  repair loop (validator errors returned verbatim) was never needed.
- **Structural stability 3/3.** Identical objects, orientation, and field types across
  runs (diff-scripted, naming variance normalized). v0's failure mode (three runs, three
  data models) did not recur. Residual variance is confined to discretionary-question
  items: a status enum only the run that asked for it has, and a closed set encoded as
  enum in one run and string in two.
- **Transport (ADR-0001) live-confirmed.** All runs rode `/v1/responses` named
  conversations; state survived gateway restarts and a mid-run credential swap.
- **Cost.** A clean full interview ran ~$0.50 at ~94% cache hit (Sonnet 4.6, metered
  key); the submit turn's internal agent loop is the cost center. Acceptable one-time
  onboarding cost against the sub-$40/seat ceiling.

## Decision

- **GO** on the keystone bet. Criteria 1 (validity) and 2 (stability) are met with
  script-judged evidence. Criterion 3 (consultative feel) rests on agent-played evidence
  only and is explicitly marked as such; a human-played interview is required before any
  design-partner session.
- **Authoring data access is settled: tools bundled in the Hermes profile.** The
  authoring task needed one static read (`read_workbook`) and one gated terminal write
  (`submit_contract`); nothing in three runs generated a reason to want a live callback.
  Tool names and shapes mirror the future control-plane interface, so the #66 swap is
  bindings, not cognition.
- **Operations-agent data access stays open.** The spike produced zero operations
  evidence; closing the seam globally would outrun it. The question is owned by the
  walking skeleton (#66).
- **The ADR-0002 gate is cleared.** #66 (control-plane walking skeleton) is next. Excel
  pane and deployment work remain gated behind it.
- **Residue recorded, not blocking:** (a) interview-skill patches needed before
  production use: a mandatory per-object probe list (states/stages question), a
  closed-set-to-enum encoding rule, and a non-skippable final review gate (one run
  skipped the full review under client time pressure); (b) the human-played run above;
  (c) the operations-vs-authoring privilege split in runtime profiles, forced by #66.

## Consequences

- `evals/workbook-authoring/profile/` is the tracked source of the authoring profile;
  `sync.sh` installs SOUL and skills, `setup.sh` (idempotent hermes CLI calls) owns
  settings. `config.yaml` is Hermes-owned and never tracked.
- The write path stays a schema-enforced submit gate regardless of the seam outcome;
  authority, not transport, remains the boundary (ADR-0001).
- Operational mechanics verified during the spike (frozen session toolsets, per-profile
  credential store, per-platform terminal, cache-split visibility) are recorded in
  `.jarvis/research/authoring-spike-findings.md` for #66 to build against.

## Alternatives considered

- **MCP callback to the control plane, probed live:** not built. The authoring workload
  gave it nothing to prove; a stub endpoint would have demonstrated transport, not
  decided anything the interface discipline had not already preserved.
- **Closing the data-access seam for the operations agent too:** rejected; no evidence.
- **Deferring GO until a human-played run:** rejected by the owner for this verdict; the
  requirement survives as a precondition for design-partner sessions.
