# Workbook Contract Agent spike

The keystone feasibility experiment for ADR-023. It feeds one deliberately messy
workbook through an LLM that must emit a semantic **contract** (never SQL), then
scores that contract against a hand-authored golden. It answers two questions
ADR-023 leaves to a spike:

1. **How close does the proposed contract get?** Scored per dimension, with the
   high-stakes calls (identity, relationships, agent-write flags) called out.
2. **Does the agent know what it does not know?** It self-flags assumptions and
   open questions; we measure how much of where it was actually wrong it
   surfaced. High recall means a human reviewer would catch the misses. A
   confident, unflagged miss on a high-stakes call is the "plausible-but-wrong
   contract" ADR-023 §5 warns about.

This is decoupled from all Excel-sync, Graph, and connector work. It needs no
database, no Docker, and no Microsoft access — only an Anthropic API key.

## Run it

```bash
pnpm install                                   # pulls @anthropic-ai/sdk
ANTHROPIC_API_KEY=sk-... pnpm evals:workbook
```

Defaults to `claude-sonnet-4-6` (enough to read the signal cheaply). Optional
knobs — run the high-fidelity pass on Opus, or change the run count:

```bash
SPIKE_MODEL=claude-opus-4-8 SPIKE_RUNS=5 ANTHROPIC_API_KEY=sk-... pnpm evals:workbook
```

The run prints a scorecard per run, a decision-stability check across runs, an
aggregate, and a usage + cost block (tokens, latency, estimated spend). Raw
outputs and `summary.json` land in `out/` (gitignored). A low score is data, not
a failure — the runner exits non-zero only on a harness error.

## What is here

| File | Role |
|------|------|
| `fixture/contacts-deals.detected.json` | The messy workbook as a *detected schema* (the mechanical-detection output of ADR-023 §2). The agent's only input. |
| `golden/contacts-deals.contract.json` | The known-good contract. Authored independently, validates against `parseContract()`. The eval target. |
| `authoring-schema.ts` | The shape the agent must emit: the contract minus stable IDs and cross-field refinements, plus self-reported uncertainty. Drives constrained decoding. |
| `prompt.ts` | The elicitation/synthesis instructions. The agent never sees the golden. |
| `agent.ts` | One run: `messages.parse` + `zodOutputFormat`, then deterministic ID assignment, then the real `parseContract()`. |
| `score.ts` | The per-dimension scorer, plausible-but-wrong list, and uncertainty recall. |
| `run.ts` | Loops N runs, prints the scorecard, measures stability, writes `out/`. |

## How scoring works

Fields are matched by meaning (normalized labels, the workbook source column, and
a small synonym map), not by exact apiName, because the agent picks its own
names. Each matched field is then checked on type, enum options, the
`editableByAgent` trust flag, and the `sensitive` PII flag. Objects are matched
with a synonym map plus the golden's own aliases. Identity and relationships are
scored as high-stakes: a wrong identity rule or a relationship modeled as a plain
text column is flagged CRITICAL. Nothing is reduced to a single blended number;
the dimensions are meant to be read separately.

The golden is one defensible reading of the fixture, not the only one. When you
change the fixture, re-derive the golden by hand first, then make the fixture
match a realistic mess — never reverse the order, or the golden becomes a
strawman.
