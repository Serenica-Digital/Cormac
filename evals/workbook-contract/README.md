# Workbook Contract Agent spike

The keystone feasibility experiment for ADR-023. It feeds a messy workbook through
an LLM that must emit a semantic **contract** (never SQL), and measures how close
it gets and whether it knows what it does not know. It is a throwaway probe in
`evals/`, decoupled from Hermes, the control plane, and the product (ADR-023 §6);
the real elicitation agent will live inside Hermes later.

Findings so far: [docs/research/workbook-contract-agent-spike.md](../../docs/research/workbook-contract-agent-spike.md).

## Two ways to run it

**Graded** — run the fixture corpus against hand-authored goldens and score it:

```bash
ANTHROPIC_API_KEY=sk-... pnpm evals:workbook        # all fixtures, 3 runs each
SPIKE_RUNS=1 pnpm evals:workbook                     # quick, 1 run each
```

**Exploratory** — run a real `.xlsx` with no golden, and present the proposed
contract plus its questions for a human to judge:

```bash
pnpm evals:workbook:explore -- /path/to/workbook.xlsx
```

Defaults to `claude-sonnet-4-6`; set `SPIKE_MODEL=claude-opus-4-8` for the
high-fidelity pass. The graded run prints a per-fixture scorecard, decision
stability, a usage + cost block, and writes `out/summary.json`.

**Real workbooks contain PII.** The exploratory path writes the detected profile
and agent outputs only to the gitignored `local/` directory. Committed fixtures
and goldens are synthetic or fully anonymized. A low score is data, not a failure:
the graded runner exits non-zero only on a harness error (a bad golden, or no
successful run).

## The corpus

Each case pairs a detected workbook profile with a golden contract, registered in
[cases.ts](cases.ts). To add a fixture: drop `<name>.detected.json` in `fixture/`
and `<name>.contract.json` in `golden/`, then add one row to `cases.ts`. The
runner validates every golden up front, so a malformed golden fails fast with no
API spend.

Current fixtures:
- **contacts-deals** — synthetic real-estate workbook. Easy by construction.
- **relationship-crm** — anonymized copy of a real client workbook. Reproduces the
  hard behavior: invalid output on a relationship missing its target, structural
  instability, over-creation.

## Files

| File | Role |
|------|------|
| `cases.ts` | The fixture corpus registry. |
| `fixture/*.detected.json` | Detected workbook profiles (the agent's input). |
| `golden/*.contract.json` | Hand-authored answer keys. Each is one defensible reading. |
| `detect.ts` | Reads any real `.xlsx` (exceljs) into the detected-profile shape. Run standalone: `tsx evals/workbook-contract/detect.ts <path>`. |
| `authoring-schema.ts` | The shape the agent must emit (contract minus IDs, plus self-reported uncertainty). Drives constrained decoding. |
| `prompt.ts` | The elicitation/synthesis instructions. The agent never sees the golden. |
| `agent.ts` | One run: `messages.parse` + `zodOutputFormat`, then ID assignment, then the real `parseContract`. Captures token usage. |
| `score.ts` | Per-dimension scorer, plausible-but-wrong list, uncertainty recall. |
| `usage.ts` | Token aggregation and approximate cost estimate. |
| `run.ts` | Graded runner over the whole corpus. |
| `explore.ts` | Exploratory runner for a real `.xlsx` (no golden). |

## How scoring works

Fields are matched by meaning (normalized labels, the workbook source column, and
a small synonym map), not by exact apiName, because the agent picks its own names.
Each matched field is checked on type, enum options, the `editableByAgent` trust
flag, and the `sensitive` PII flag. Objects are matched with a synonym map plus the
golden's aliases. Identity and relationships are scored as high-stakes: a wrong
identity rule or a relationship modeled as a plain column is flagged CRITICAL.
Nothing is reduced to a single blended number; the dimensions are read separately.

A golden is one defensible reading of an ambiguous workbook, not the only one. When
you add a fixture, author the golden by hand first, then keep the fixture honest.
