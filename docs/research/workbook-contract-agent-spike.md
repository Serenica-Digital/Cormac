# Workbook Contract Agent spike: first result

> **Status:** spike findings, evidence for the ADR-023 GO/NO-GO · **Date:** 2026-06-10 · **Harness:** [evals/workbook-contract/](../../evals/workbook-contract/)

This is the status update ADR-023 open item 1 asks for. It reports the first run of the Workbook Contract Agent feasibility spike. It is evidence, not a verdict: the GO/NO-GO belongs to a follow-up status ADR (the way ADR-021 reported back on ADR-006), made after this evidence and at least one real-workbook run.

## What was tested

One deliberately messy synthetic real-estate workbook, fed in as a mechanically-detected profile (sheets, columns, sample values, inferred types). The agent had to emit a semantic contract: objects, fields, types, identity rules, relationships, aliases, and the two trust flags per field. The output was forced to a valid structure by constrained decoding, then validated by the real `parseContract`, then scored against a hand-authored golden contract. Model: `claude-sonnet-4-6`, 3 runs. The full method is ADR-023; the harness is reproducible with `pnpm evals:workbook`.

The fixture has two intended objects (a person and a deal/listing) plus a third Log sheet that is a genuine judgment call, with a `Client` alias for person, a listing-to-person relationship carried only by name, messy enum casing, mixed date and currency formats, PII columns, and an internal `Priority` column the agent must recognize as human-only.

## Headline

On this fixture the mechanism works end to end and the semantic quality is high. The single most important safety signal held in every run: the agent never granted itself write access to a human-only field. Its self-reported uncertainty was accurate and its elicitation questions were genuinely good. Two real weaknesses showed up: the contract's surface naming is not stable across runs, and the agent consistently models the Log as its own object where the golden folds it in (a defensible divergence it flagged each time).

This is a strong day-one result. It is also necessary, not sufficient: the fixture is synthetic and was authored alongside the golden, so it is easy by construction. The result proves the agent and the harness can handle the easy-to-medium case; it does not yet prove the agent survives a real client's workbook, which is where the plausible-but-wrong risk (ADR-023 §5) actually bites.

## Scorecard (mean of 3 runs, Sonnet)

| Dimension | Result | Read |
|---|---|---|
| Contract validity (`parseContract`) | 3/3 OK | Every run produced a fully valid contract. |
| Object recall | 100% | Both intended objects found every run. |
| Object precision | 67% | A third `activity` object created each run (see below). |
| Field recall / precision | 100% / 100% | All 11 golden fields matched, no spurious fields. |
| Type correctness | 11/11 | Including phone, email, enum, date, number, relationship. |
| Enum capture | 3/3 | Messy casing normalized to clean option sets. |
| Identity (semantic) | 2/2 every run | Match person by name+email, deal by address. Logic stable across runs. |
| Relationships | 1/1 every run | Listing-to-person modeled as a relationship, not a duplicated text column. |
| Agent-write flags | 88% | Only divergence: agent marked email/phone human-only (stricter than golden). |
| Trust-direction violations | 0 | Never opened a human-only field to the agent. The signal that matters most. |
| Sensitive/PII flags | 11/11 | email and phone flagged sensitive. |
| Aliases | 2/2 | Client = person and Listing = deal captured. |
| Uncertainty recall | 100% | Every scored divergence was something the agent had flagged. |
| Plausible-but-wrong (critical, unflagged) | 0 per run | Caveat: the fixture had no adversarial identity trap. |
| Cost / latency | ~$0.043/run, ~46s/run | 3 runs total ~$0.13 and ~2.3 min on Sonnet. |

## What went right

- **The trust boundary held.** `Priority` is described in the fixture as an internal hotness rating assigned by feel. All three runs set `editableByAgent: false` on it, with explicit reasoning ("the workbook comment explicitly states it is an internal hotness judgment"). Zero runs let the agent write a human-only field. This is the authoring analog of the silent-write problem and it did not occur.
- **The agent was safe where it diverged.** The only agent-write mismatches were runs 2 and 3 marking `email` and `phone` as human-only, where the golden allows agent writes. That is the agent being more conservative than the golden on PII, not less. It is arguably more correct than the golden.
- **Elicitation is the strong suit.** The open questions were specific and real: split households like "the Patels (Dev & Anjali)" into linked records, define the Priority scale and the outlier value "A", allow multi-client listings (co-buyers), distinguish lead from prospect, link activities to listings as well as clients, handle multi-address email cells, decide whether empty-email rows block import. These are the questions a good analyst asks. ADR-023's second measurement (how the interview feels) reads well.
- **Self-knowledge was accurate.** `lowConfidence` consistently named the genuinely shaky calls: `priority.editableByAgent`, the activity object decision, listing-client cardinality, the identity fields, and "Cold lead" normalization. Uncertainty recall was 100%: nothing the scorer flagged was a surprise the agent had hidden.

## What the numbers hide

- **The fixture is circular and easy.** One synthetic workbook, authored by the same person as the golden. It cannot help but telegraph its own answers. Treat every high number as "the agent and harness clear the easy case," not "the agent is this good in the wild."
- **Naming is not stable.** The person object was `client` in runs 1 and 2 and `person` in run 3; its name field was `name` in run 2 and `full_name` otherwise; the activity relationship pointed at `client` vs `person` accordingly. The identity *logic* (name plus email) was stable across all three runs, and the scorer's synonym mapping saw through the renames, but a contract is a versioned source of truth where apiNames are load-bearing. Surface instability is the clearest thing to fix: lower temperature, a naming convention in the prompt, or harness-side canonicalization of apiNames.
- **Object granularity is a standing judgment call.** All three runs made the Log a first-class `activity` object; the golden folds it into per-person interactions. The agent's choice is defensible and it flagged the call every time and asked the manager. This is not an error so much as proof that object granularity is a decision the human must own at the publish gate.
- **The plausible-but-wrong score was not stress-tested.** Zero unflagged critical misses is real, but the fixture contained no case where the obvious identity rule is the wrong one. A real workbook will. The 0 here means the harness and agent are clean on an easy board, not that the failure mode is beaten.

## Decision stability

Across 3 runs the identity-and-relationship fingerprint produced 3 distinct surface variants, all semantically equivalent. The variation was entirely in naming (`client`/`person`, `name`/`full_name`), never in the underlying logic. So the agent is stable on *what identifies a record* and unstable on *what to call it*. For a published contract, the second still matters.

## Recommendation

Lean GO on the approach, with the verdict deferred until a real workbook is run. Concretely:

1. **Run the spike on the design partner's real workbook next.** It is the decisive test and the lowest-infrastructure one (uploaded file only, ADR-023 §6). Everything above is encouraging but easy-mode.
2. **Add naming determinism** before this is anything a human publishes: a naming convention in the prompt or a canonicalization pass, plus lower temperature for the authoring call.
3. **Keep the human firmly on granularity and identity.** The agent should keep proposing and flagging; the publish gate owns the object-granularity and identity-rule decisions. The evidence says the agent will surface these, which is exactly what makes human-in-the-loop viable.
4. **Grow the eval corpus** (ADR-023 open item 4). This fixture and golden are the first pair. Add real and adversarial pairs, especially ones with an identity trap, so the plausible-but-wrong number means something.

## Maps to ADR-023 open items

- **1. Spike result.** This document. Mechanism proven, semantic quality high on an easy fixture, safety flag held, real-workbook test outstanding.
- **2. Question strategy.** The agent asks good questions unprompted. Open: capping interview length and deciding which questions block publish versus which are advisory.
- **3. Identity and relationship inference.** Identity logic was correct and stable; relationship inference worked. Open: behavior under a real workbook where identity is genuinely ambiguous, and the naming instability.
- **4. Authoring eval set.** Seeded: one workbook-to-contract pair plus a working scorer. Needs real and adversarial pairs.

## Reproduce

```bash
ANTHROPIC_API_KEY=... pnpm evals:workbook          # Sonnet, 3 runs, ~$0.13
SPIKE_MODEL=claude-opus-4-8 pnpm evals:workbook     # high-fidelity pass
```

Per-run outputs and `summary.json` land in `evals/workbook-contract/out/` (gitignored). The fixture and golden are committed as the starter corpus.
