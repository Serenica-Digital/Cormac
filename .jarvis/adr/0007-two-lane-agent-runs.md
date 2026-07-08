# 0007 — Two-lane agent runs: dev = Codex gpt-5.5 for iteration, staging = metered Sonnet for evidence

- **Status:** Accepted (2026-07-08)
- **Builds on:** ADR-0005 (Infisical-only secrets; its §4 amendment records the delivery
  mechanics this ADR is the decision record for), ADR-0006 (the environment slugs this
  rides), ADR-0004 (the Sonnet-tuned interview skill and its cost baseline)

## Context

Iterating on the authoring agent (skill patches, harness work, transport plumbing) burns
model calls that have nothing to prove about cost or quality, while GO-grade evidence
(ADR-0004's ~$0.50/interview at ~94% cache) must stay measurable on the exact production
model and billing path. The owner's requirement: cheap runs during development, and an
easy switch to the proper metered flow when measuring real costs. Two traps were found on
the way to this decision: the claude.ai-OAuth fallback looks like "the subscription" but
bills the plan's **extra-usage pool**, not the plan allocation (verified 2026-07-08 by
cap-exhaustion probe — caught by the owner); and model/provider is Hermes `config.yaml`
state, not env, so it cannot ride the vault slot by itself.

## Decision

The Infisical environment (ADR-0006) selects the whole world for an agent run —
credentials, database, **and model/billing lane**. `hub.sh` pins model/provider per slot
with idempotent `hermes config set` at launch:

| Lane | Launch | Model / billing | Use for |
|---|---|---|---|
| **dev** | `pnpm agent:hub run` | gpt-5.5 on the Codex OAuth plan (flat-rate) | tests, plumbing, harness and skill-mechanics iteration |
| **staging** | `INFISICAL_ENV=staging pnpm agent:hub run` | Sonnet 4.6 on the metered `ANTHROPIC_API_KEY` (required; launch fails without it) | cost, verdict, and interview-behavior evidence |

**Evidence rule (binding):** cost, verdict, and interview-behavior evidence comes from
metered Sonnet runs only. Dev-lane runs are a different model; they never update
VERDICT.md, ADR claims, or skill-tuning conclusions. The lanes exist because the models
demonstrably behave differently: gpt-5.5's submit ran as one large call where Sonnet's
spike submit looped ~14–15.

**Mixed mode (sanctioned, occasional):** metered cost measurement over disposable local
data = staging gateway + dev control plane, carrying the dev agent token:
`CORMAC_AGENT_TOKEN=$(infisical secrets get CORMAC_AGENT_TOKEN --env=dev --plain)
INFISICAL_ENV=staging pnpm agent:hub run`. The token pairs with the *database* world (the
control plane hashes it against its own DB); a parent-shell value survives `infisical
run` when the slot lacks the name (verified). Forgetting it fails loud (401), not silent.

## Verified (2026-07-08, full E2E on the dev lane)

- Complete 5-turn authoring interview through the product path (human JWT →
  `/authoring/turn` → gateway → `/agent/*` tool callbacks): workbook read 200, ambiguity
  catches, non-skippable review incl. the trust question, `POST /agent/contract/submit`
  200, `contract_versions` v1 active, `parseContract` valid (2 objects, 10+2 fields).
- **Prompt caching works on the Codex OAuth path** and is reported in the same
  `cache=X/Y` gateway-log format: cold first call, then 77–97% hits across the interview;
  the submit turn ran at 97%. Named conversations held state across all HTTP turns.
- Whole eval billed $0 metered (rode the Codex plan).

## Consequences

- Cheap iteration is the default (`pnpm agent:hub run` and go); metered evidence is one
  env var away. The eval README carries the evidence rule beside the run instructions.
- The dev lane's quality is a bonus, never evidence: anything that looks
  publish-worthy on gpt-5.5 must be re-run on the staging lane before it counts.
- Cost accounting still reads the gateway log (`cache=X/Y`); the `/v1/responses` usage
  block has no cache split (spike finding, still true on the codex provider).
- Anthropic-side policy exposure is reduced to zero in dev: the Codex OAuth plan is the
  community-standard Hermes arrangement on OpenAI's side, and the metered key is the
  production-clean path on Anthropic's.

## Alternatives considered

- **claude.ai-OAuth fallback as the dev lane (same Sonnet model, "the subscription"):**
  rejected — bills the extra-usage pool, not the plan allocation; defeats a cheap dev
  mode. Same-model iteration, when needed, is a metered staging run.
- **Wrapper-level key stripping (`env -u`) or a dedicated Infisical environment for
  billing:** rejected as invented mechanisms; the owner's call — billing is a property of
  the environments that already exist.
- **One lane (metered only):** rejected; it taxes every iteration loop and was the
  original complaint.
- **Per-request model override on the gateway:** not supported by the platform
  (`-m/--provider` pair with one-shots; gateway model overrides are interactive
  slash-commands only) — hence `config set` at launch.
