# Workbook Contract Agent spike: findings

> **Status:** spike findings, evidence for the ADR-023 GO/NO-GO · **Last updated:** 2026-06-10 · **Harness:** [evals/workbook-contract/](../../evals/workbook-contract/)

This is the status update ADR-023 open item 1 asks for. It reports the Workbook Contract Agent feasibility spike across two fixtures: a synthetic real-estate workbook authored alongside its golden, and an anonymized copy of a real client workbook. It is evidence, not a verdict. The GO/NO-GO belongs to a follow-up status ADR, the way ADR-021 reported back on ADR-006.

The spike is a throwaway probe in `evals/`, deliberately decoupled from Hermes, the control plane, and the product (ADR-023 §6). Its only job is to learn whether the keystone is feasible before that work is built for real inside Hermes.

## What was tested

The agent receives a mechanically-detected workbook profile (sheets, columns, sample values, type guesses) and must emit a semantic contract: objects, fields, types, identity rules, relationships, aliases, and the two trust flags per field. Output is forced to a valid structure by constrained decoding, then validated by the real `parseContract`, then scored against a hand-authored golden. Model `claude-sonnet-4-6`. Reproduce with `pnpm evals:workbook`.

Two fixtures make up the eval corpus (ADR-023 open item 4):

1. **contacts-deals** — a synthetic real-estate workbook. Easy by construction: the mess and the golden were authored together.
2. **relationship-crm** — an anonymized copy of a real client workbook. A relationship CRM with three same-shape sheets across business segments, an internal owner column, a computed days-since column, an active/former status hidden inside a company name, two people in one row, deals named only in free-text notes, and no email or phone anywhere. All names and firms are fabricated; the structure and messiness are preserved.

## Headline

The agent reasons and interviews very well. Where it is weak is producing a valid and consistent final structure on genuinely ambiguous real data. The synthetic fixture looked excellent and hid both problems. The real workbook surfaced them: the agent failed schema validity on every run and produced a different object model each run. Its reasoning, the questions it asks, and its self-reported uncertainty are the strong suit, and they are what make the human-in-the-loop design viable.

Net: the approach is promising, the one-shot raw output is not yet publish-ready, and the path forward is the two-phase design the project already intended — ask the structural questions first, then fill the contract.

## Run 1: synthetic real-estate fixture (easy)

- Valid contract every run. Objects, fields, types, enums, identity logic, the listing-to-person relationship, and PII flags all correct or defensible.
- **Trust boundary held: zero trust-direction violations.** The agent never granted itself write access to the human-only field. The only agent-write divergences were it being more conservative than the golden on PII.
- Strong elicitation, 100% uncertainty recall.
- Caveats: the fixture is circular and easy; apiName naming was unstable across runs (`client` vs `person`); it consistently made the activity log its own object, a defensible call it flagged each time.

This was encouraging but necessary, not sufficient. It proves the agent and harness clear the easy case.

## Run 2: real client workbook (hard), via the anonymized fixture

Three findings.

1. **Invalid every run.** All runs failed `parseContract`, the same way: a relationship field declared without naming its target. Constrained decoding guarantees the output's shape, not the cross-field meaning-rules, and on messy real data a meaning-rule broke every time. The ADR-023 §4 "bounded output" claim holds only for structure. Fixable with a prompt tightening plus a one-shot self-repair, but real.

2. **Structurally unstable.** Three runs produced three materially different data models: one flat contact-with-everything; contact plus a separate firm; contact plus a separate organization with the segment fields moved onto it. Each is individually plausible and approvable, and they are different foundations. This is the plausible-but-wrong risk (ADR-023 §5) made concrete, and the synthetic fixture could not surface it. The agent flagged the single-object-versus-multiple decision as its highest-stakes uncertainty in every run, so the instability is honest and points straight at the decision a human must make.

3. **Excellent reasoning and questions.** It identified the computed days-since column as read-only, the internal owner column, the status hidden in a company name, the two-people-in-one-row record, and deals named only in notes that imply a pipeline tracked elsewhere. Its open questions are the questions a sharp analyst asks. One over-reach: it invented email and phone fields the workbook lacks, and flagged that.

The anonymized fixture reproduces all of this and is committed as a permanent regression test.

## Scorecard (one run each, Sonnet)

| Dimension | synthetic (easy) | real-modeled (hard) |
|---|---|---|
| Contract validity | OK | FAILED (relationship without target) |
| Field recall | 100% | 71% |
| Identity | 2/2 | 1/2 |
| Relationships | 1/1 | 0/1 |
| Trust-direction violations | 0 | 0 |
| Over-creation | activity object (flagged) | interaction object (flagged) |

Run the full statistical pass (3 runs each) with `pnpm evals:workbook`.

## What this means

- The reasoning was never the risk. The consistency and validity of the final structure are.
- Fully-autonomous authoring is off the table, now with evidence. Human-in-the-loop and developer-assist are required, as ADR-023 §4 and ADR-002 assumed.
- One-shot authoring is the wrong shape. The instability argues for the two-phase flow the project already envisioned: the agent surfaces the structural questions, a human answers, then the agent fills the contract. Decide the fork first, then the details.

## Recommendation

The approach earns continued investment, with the GO/NO-GO still deferred until the fixes below are tried.

1. **Tighten validity.** Require a target on every relationship, add a one-shot self-repair when `parseContract` fails, lower the temperature, then re-run for a fair validity read.
2. **Build phase one where it belongs.** The real elicitation agent lives inside Hermes, behind the runtime adapter (ADR-006), not in this throwaway spike. The spike has done its job.
3. **Two-phase authoring.** Structure agreed with the human first, then field-fill.
4. **Grow the corpus** (open item 4). More real-modeled and adversarial fixtures, especially ones with an identity trap, so the plausible-but-wrong number means something.

## Maps to ADR-023 open items

- **1. Spike result.** This document. Mechanism works, reasoning strong, raw output not yet valid or consistent on hard data.
- **2. Question strategy.** The agent asks good questions unprompted. Open: the two-phase flow and capping interview length.
- **3. Identity and relationship inference.** Correct and stable on easy data, unstable on ambiguous data. The single-object-versus-multiple structural fork is the crux.
- **4. Authoring eval set.** Two fixtures (one synthetic, one real-modeled) plus a scorer. Add more.

## Reproduce

```bash
pnpm evals:workbook                              # graded, all fixtures in the corpus, 3 runs each
pnpm evals:workbook:explore -- <path.xlsx>       # exploratory: a real workbook, no golden, for human judgment
```

Real workbooks contain PII. The exploratory path writes the detected profile and agent outputs only to the gitignored `evals/workbook-contract/local/` directory. Committed fixtures and goldens are synthetic or fully anonymized.
