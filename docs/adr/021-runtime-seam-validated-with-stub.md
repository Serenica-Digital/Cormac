# ADR-021: The runtime seam is validated and committed; real Hermes integration stays open

**Status:** Accepted (the seam is committed); resolves ADR-006 open item 4 partially, with the real-runtime half explicitly still open
**Date:** 2026-06-07
**Related:** Reports the spike result ADR-006 made its status contingent on ("a de-risk spike that converts it to a committed GO/NO-GO"), resolving ADR-006 open item 4. The adapter it commits is the contained, swappable boundary of ADR-006 section 4 and the untrusted-output discipline of ADR-005. It runs the roles of ADR-008, stays stateless per ADR-009, and the deployment half of the original shared spike still belongs to ADR-017 (Juno). The runtime stub lives at `services/runtime-stub` (ADR-018).

## Context

ADR-006 adopted Hermes behind a swappable Agent Runtime Adapter, but deliberately held its status at "accepted as direction" until a de-risk spike proved the seam end to end. It listed what the spike had to show: tenant context in, structured proposal out, all output untrusted and Zod-validated at the boundary, the write gates stopping a write, and stateless plus injection containment with measured latency, ideally on Juno so the seam and the deployment proved out together.

The walking skeleton built that adapter and ran the entire thread end to end against real Postgres, but against a deliberately dumb in-process stub that mirrors the runtime's HTTP contract, not against real Hermes. That split is the whole point of this ADR. It would be dishonest to record a clean GO on "the runtime" when what was exercised was the seam with a stand-in. So this ADR separates the two: the seam is proven and committed, and the real-Hermes integration is still open and named precisely.

## Decision

Commit the Agent Runtime Adapter as the stable, validated boundary. Record the real-Hermes integration as the remaining, explicitly-unproven work.

### 1. What the seam proved (committed)

Exercised live, against real Postgres, with the stub behind the adapter:

- **The adapter contract holds over HTTP.** Tenant context, the active contract, and the inbound text go in; a structured proposal comes back; everything returned is treated as untrusted. A different implementation behind the same HTTP contract drops in unchanged, which the stub itself demonstrates (it is the swap).
- **Structured-output validation at the boundary works and is enforced, not aspirational.** The adapter Zod-validates the proposal's shape; malformed output, error responses, and an unreachable runtime are all rejected as a failed call and never become a write. Then the contract-level check rejects any field the contract does not mark agent-editable, or any value of the wrong type. Demonstrated end to end: an instruction to set a human-only field (`internal_rating`) is rejected at capture with a 422 naming the field, and malformed runtime output is rejected by the adapter test.
- **The full thread runs:** capture writes a source message, the adapter calls the runtime, the proposal is validated and held (confirm-each), approval writes the record and an audit event carrying before/after and the source link. This is the spine ADR-005 and ADR-010 describe, proven against the real database, not a mock.

This converts ADR-006's seam from "accepted as direction" to committed. The instruct-and-parse plus Zod-at-the-boundary discipline (ADR-006 section 2) is the one we build on, and the contained, reversible boundary of ADR-006 section 4 is now demonstrated rather than asserted.

### 2. What the stub did not prove (still open)

The stub is a Node service returning deterministic JSON. By construction it says nothing about the real runtime. These remain unproven and are the next increment:

- **Real Hermes behind the adapter:** running actual Hermes (Python, in a container, with bearer auth) where the stub now sits.
- **The real write-gate mechanisms.** The skeleton holds proposals at the control plane (the proposal-and-confirm pipeline). Hermes's two in-run gates, the `pre_tool_call` hook and the native approval endpoint (ADR-006 section 2), are not yet wired.
- **Structured-output reliability from a real model.** The stub always returns valid JSON. Whether a real model adheres reliably under instruct-and-parse, or whether the `complete_structured` skill path is needed, is the open question (ADR-006 open item 2, ADR-013).
- **Latency, statelessness, and the leak.** Cold, warm, and end-to-end latency; stateless-per-task on warm recycled workers; the P1 memory-leak mitigation; injection containment. None of these are exercised by a stub (ADR-006 section 3 and risks).
- **Deployment on Juno.** The deployment half of ADR-006's shared spike still belongs to ADR-017 and is not done; local Docker corruption blocked the local container run during the build, and CI plus Juno remain the path to prove it.

### 3. Status change for ADR-006

ADR-006 moves from "accepted as direction, pending a de-risk spike" to **seam committed, runtime integration pending**. The contained-and-reversible claim is strengthened: the stub is a live demonstration that the boundary swaps. The risk-budget reasoning of ADR-006 is unchanged and now better supported: the seam was the cheap part to de-risk and it is done, so the remaining variance sits where ADR-006 said to spend boldness, in the real model and runtime behavior, not in the boundary.

## Consequences

### Architectural

- The adapter is now a fixed contract other work can build against. Surfaces, the proposal pipeline, and the audit path do not care what implements the runtime, which is what lets the SMS and other surfaces (ADR-007) proceed on a stable seam.
- Swapping the stub for real Hermes, or for the owned Node/TS agent loop kept as the live fallback (ADR-006 alternatives), is a contained change behind the boundary, not a rewrite.

### Planning

- Phase-2 estimates for the agent layer may rely on the seam as settled, but must budget the real-Hermes integration in section 2 as open, not fold it into a clean runtime GO. The honest headline is "seam: done; runtime: next," not "Hermes: done."

### Risk accepted

- Carrying a stub as the runtime for now means the spine's behavior reflects deterministic output, not a real model. The mitigations (the adapter rejects malformed output; the contract gate rejects illegal writes) hold regardless of what is behind the seam, so the trust boundary is real today; what is not yet real is the agent's intelligence and the runtime's operational behavior.

## Alternatives considered

**Declare a full GO on Hermes now.** Rejected as dishonest. The stub proves the seam, not the runtime. Recording a clean runtime GO would overstate what was tested and bury the real integration risk.

**Run the real Hermes spike first, as a throwaway.** The original ADR-006 framing allowed this. We chose the non-throwaway walking skeleton instead, which proved the seam with code we keep, and made the real-Hermes integration the next increment behind a stable boundary rather than a discarded probe. The cost is that the real-runtime questions are answered later; the benefit is that nothing was thrown away and the seam is committed on reusable code.

**Drop Hermes and build the owned Node/TS loop now.** Still the live fallback from ADR-006. Not chosen now because the seam being committed means adopting Hermes stays a contained experiment behind the adapter; the fallback remains available if the real-Hermes integration sours.

## Open items

1. **Real Hermes behind the adapter:** container, bearer auth, the two write gates, measured cold/warm/end-to-end latency, stateless-per-task on warm recycled workers, and the leak mitigation (ADR-006 section 3, risks).
2. **Structured-output path:** instruct-and-parse versus the `complete_structured` skill, decided against a real model (ADR-006 open item 2, ADR-013).
3. **Juno deployment** of the runtime container, the deployment half of the shared spike (ADR-017).
4. **Retiring the stub:** when real Hermes is integrated and green, and whether the stub stays as a fast deterministic runtime for tests and CI.
