# Agent-system round: governed learning, agent structure, runtime hosting (2026-07-13)

> **Status:** reference · owner-commissioned research + design round ("have we hamstrung
> the agents?"), run inline in one session. Decisions ride ADR-0015/0016 (Proposed);
> build evidence rides PR #117. Installed runtime: Hermes Agent v0.17.0 (2026.6.19).

## The question

Per-client Cormacs that remember the client, learn from conversations, possibly evolve
their own skills — without giving the injection-facing agent a poisonable memory. Owner
scoping: learning depth = "remembers the client"; agent-authored skill evolution is a
deferred door, not this round's build; the design must inform runtime deployment (#100)
before EKS work lands a shape we would outgrow.

## Findings: which restrictions are load-bearing

**Memory-off is red-team-backed, and the fix is our own gate.** Verified citations,
carried from the v0 round (`archive/docs/research/workspace-knowledge-layer-design.md`,
claims adversarially verified 3-0 there):

- Hermes with persistent memory on measured **66.7% attack success** across six
  memory-poisoning classes (arXiv 2606.04329; caveat: GPT-OSS-120B, preprint).
- Microsoft's red team: poisoning succeeded 40% baseline, **>80% when the agent was
  prompted to consult memory**; their mitigation, "authenticated memorization" =
  external validation of every memory write through a trusted layer.
- Highest-ASR class: **auto-compaction of untrusted content into durable context**
  (85%). Never auto-distill tenant data into context.

**The curator incident (#72) was a governance gap, not an ungovernable mechanism.**
Verified from upstream docs (Context7, `/nousresearch/hermes-agent`): the curator
auto-snapshots before every run, supports rollback/pin/dry-run, and is prune-only by
default (LLM consolidation is opt-in). `skills.write_approval true` stages every
in-session skill write under `~/.hermes/pending/skills/` for out-of-band review
(verified in-repo, authoring hardening pass). Upstream also has `memory.write_approval`
(docs; unverified live) and threat-scans memory entries at snapshot build
(`tools/memory_tool.py`, doc-sourced). Agent-authored skill evolution is therefore
*gateable* — deferred by choice, not impossibility.

**Hermes 0.17 constraints that bound any design** (verified in-repo unless noted):

- Session toolsets freeze at conversation start; **no per-run toolset override** on the
  API server (`/v1/runs` body accepts only input/instructions/history/session/model —
  source via Context7). Capability modes need separate profiles/gateways, not requests.
- `instructions` is per-request: the compiled-context seam carries per-workspace and
  per-task state (live-proven since the spike).
- `/v1/responses` accepts `conversation_history`: **a fresh named conversation seeded
  with stored turns continues with full context** (verified live this round; the
  codename probe). This is the #96 durability answer.
- Profile distributions (`distribution.yaml`, git-tagged SOUL+skills) exist upstream for
  versioned profile content (docs; unverified live).
- 0.18 deltas: not indexed in the docs snapshots; re-verify at upgrade.

**The learning architecture was already designed and partly built.** The v0 five-strata
knowledge layer (contract / glossary / learned knowledge / procedural skills / episodic
history, all governed data compiled into the cached prefix, one review gate) was
researched, filed (old-tracker #35/#47), and never built in v2 — but the v2 port kept
the seams: `renderWorkspaceContext(contract, learned)` shipped with an empty learned
list, byte-stable sorted rendering, and injection-neutralizing `inert()` already in
place (`packages/contract/src/render.ts`).

## Built and proven this round (PR #117, dev lane; metered re-proof pending on #76)

- `learned_knowledge` (migration 0011): typed slots only (record-bound `alias` with FK
  cascade, `enum_synonym`); pending/approved/rejected; `propose_learning` +
  `search_history` on `/agent/*` and the ops plugin; human review + audited decisions;
  approved rows compiled into the prefix. Control-register row 29 (Verified).
- **Dev-lane E2E (gpt-5.5, not billable evidence):** "when I say Mo I mean Morgan
  Ellis" → one staged alias, right record id, quoting rationale → approved → "Mo
  confirmed for Thursday" resolved to Morgan Ellis's record with correct last-touch
  upkeep → "what did I say Mo wanted to see?" answered "the Hartwell deck" cross-task
  (stateless runs; `search_history` is the only path — 3 calls in the gateway log).
  Cache held 86-95% across the learning publish.
- **Replay probe:** conversation A holds a fact; fresh conversation B given A's turns
  via `conversation_history` recalls it perfectly. Interviews are rebuildable from
  control-plane-stored turns; no persistent volume needed. Residual to verify at build
  time: real interviews carry tool calls in history; text-turn replay likely suffices
  because workbook/contract state rides the instructions prefix, but this is assumed,
  not proven.

## Fleet shape (feeds #100/#68)

Per-workspace gateway pair is the v0.17-safe unit: the agent token is env-bound at
launch and IS the tenant binding (ADR-0005); no safe per-run tenant injection exists.
The chart layer already exists (PR #93 `deploy/charts/hermes`, image
`Dockerfile.hermes` baking both locked-down profiles, `PROFILE` env selects;
kind-proven 2026-07-10). Per-client difference rides entirely in env (token) + the
compiled prefix — profile content stays identical across clients, so no per-client
images. Footprint today: ~512Mi-1Gi per gateway; beta scale is a handful of pairs;
pooling/scale-to-zero deferred until client count makes it matter.

## What was deliberately not done

- Runtime memory stays off for every client-facing agent (the evidence above).
- Agent-authored skill edits: the door is designed (write_approval staging → review →
  versioned profile content), not built. Named in ADR-0015 as the deferred rung.
- Hermes cron exists (per-job `enabled_toolsets`, docs) but proactivity should be
  control-plane-scheduled when it comes; not this round.
- `precedent`/free-text learning slots stay rejected ("free-text memory wearing a typed
  hat", v0 verdict).
