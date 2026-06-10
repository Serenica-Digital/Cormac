# ADR-025: The agents run as tool-using agents; the proposal is a schema-enforced tool call

**Status:** Accepted
**Date:** 2026-06-10
**Related:** Refines the integration posture of ADR-006 (Hermes runtime) and the role design of ADR-008 (two agent roles). It strengthens, and does not loosen, ADR-005 (the control plane is the only writer) and ADR-009 (govern learning as data; memory stays off). It changes what the real-Hermes spike of ADR-021 open item 1 must test, dissolves the structured-output question of ADR-006 open item 2, and makes ADR-007 open item 1 (how the runtime calls our tools) the next design decision. Evidence comes from the Workbook Contract Agent spike findings ([docs/research/workbook-contract-agent-spike.md](../research/workbook-contract-agent-spike.md)) and the deployment research ([docs/research/juno-hermes-deployment-research.md](../research/juno-hermes-deployment-research.md)).

## Context

The integration plan had drifted into a posture nobody had decided on purpose: run the runtime as a strapped-down one-shot executor. Everything agentic disabled, a single stateless run per task, the proposal extracted from the run's final text by instruct-and-parse, and Zod cleaning up afterward. Three findings broke that posture in one week.

First, the workbook spike showed one-shot instruct-and-parse failing on real data: on the real-modeled fixture every run produced a contract that failed `parseContract`, and the runs disagreed with each other structurally. Constrained shape was not the problem; cross-field meaning was. Second, the deployment research confirmed the runtime's HTTP API offers no schema parameter at all, and the apparent fix, calling `complete_structured` from inside a runtime skill, would migrate keystone prompt-and-schema logic into Python inside the runtime, eroding the swappable boundary that justified adopting the runtime in the first place (ADR-006 section 4). Third, re-examining the work itself showed the plan had conflated two different operations: authoring (workbook to contract, a multi-turn elicitation task) and operations (unstructured update to matched proposal). And the operations path is genuinely agentic: matching "Dave is ready to move on the Maple St listing" to records requires searching candidates, reading current values for a before/after diff, and noticing ambiguity worth a clarifying question. That is retrieval plus judgment in a loop, not a single completion. A tenant's record set cannot be stuffed into a prompt; the agent must look things up.

The tied-hands feeling was real and diagnosable: the one-shot posture was the proposal path's output requirement leaking onto the entire runtime. The runtime was adopted because it is an agent harness. The plan then amputated everything that makes it one, and the amputation was never load-bearing for trust. The trust model never required a runtime that cannot act; it requires that no action becomes a write without passing the control plane's gate (ADR-005).

## Decision

### 1. Both agent roles run as real tool-using agents

The Workbook Contract Agent and the CRM Operations Agent (ADR-008) run on the runtime as agents: multi-turn where the task needs it, with read-only retrieval tools provided by the control plane (search records, get record, list candidates, read the active contract). The operations agent loops over retrieval to match entities before proposing. The authoring agent runs the two-phase interview the spike findings call for: surface the structural questions, a human answers, then fill the contract.

### 2. The proposal is a tool call, and the schema lives on the tool

Structured output is enforced at the tool layer, not parsed out of final text. The terminal action of a successful run is a tool call, `submit_proposal` for the operations agent and `propose_contract` for the authoring agent, whose arguments are the proposal payload. Tool-argument schemas are enforced at the model layer (strict tool use guarantees argument shape) and validated again by Zod at the control-plane boundary, which remains the authoritative gate (ADR-005). This dissolves the instruct-and-parse versus `complete_structured` question (ADR-006 open item 2): neither is the design. The schema parameter the runtime's HTTP API lacks stops being load-bearing, and the keystone's prompts, schemas, and tool definitions stay in our TypeScript, authored and versioned by the control plane.

### 3. Containment is gates plus per-role tool allowlists, not amputation

- The write gates do the containing: the `pre_tool_call` hook captures and vetoes tool calls before execution, and the proposal pipeline holds everything else (ADR-005, ADR-006 section 2). The agent works freely; consequential actions pass the gate.
- Each role gets only its tools. The operations agent never sees `propose_contract` or any contract-mutating capability; the authoring agent never sees record-write tools. The allowlist is tenant- and role-scoped control-plane configuration.
- What stays off stays off, for the original reasons: persistent memory off because learning lives as governed data (ADR-009), messaging gateways off because connector ingress is the control plane's (ADR-005, ADR-007), and runs remain stateless per task with multi-turn state (the interview) held and replayed by the control plane.

### 4. The spike becomes a head-to-head with kill criteria

The real-Hermes integration spike (ADR-021 open item 1) tests this posture, not the abandoned one: tool-arg schema adherence under a real retrieval loop, both write-gate paths capturing and stopping tool calls, the interview running multi-turn through control-plane-held state, and latency under the loop. It runs head-to-head against the live fallback, the owned Node/TS loop (the runtime stub plus a model call with native strict tool use is most of that fallback already), and the result is recorded in a status ADR the way ADR-021 reported on ADR-006. If the runtime cannot hold the gates or the tool-arg guarantee under a real loop, the fallback wins on evidence.

## Consequences

- The control plane grows a tool surface for the runtime: tool definitions, per-role allowlists, and the endpoints the tools call. How the runtime reaches those tools (registered as native runtime tools versus an MCP server we host) is ADR-007 open item 1 and is now the next design decision on this path.
- The runtime earns its keep or loses its place on agent-harness grounds (the loop, mid-run approvals, provenance), not on being a thin HTTP wrapper around a model call. This is the honest version of ADR-006's bet.
- The authoring agent's "bounded output" claim (ADR-023 section 4) gets a real mechanism: bounded by the tool schema at generation time, not by hope at parse time.
- Multi-turn interview state becomes an explicit control-plane responsibility (session storage, replay per turn). This was implicit in ADR-009's statelessness; it is now named work.

## Alternatives considered

**Keep the one-shot instruct-and-parse posture.** Rejected on the spike evidence: it failed validity on every real-fixture run, and it under-uses the runtime so severely that the runtime's presence stops being justifiable.

**Enforce structure via `complete_structured` inside a runtime skill.** Works mechanically, rejected for lock-in: it moves keystone logic into Python inside the runtime, which inverts the swappable-adapter premise of ADR-006.

**Patch the runtime upstream to pass a schema parameter through the HTTP API.** Kept as a known option (MIT license, small surface), no longer needed for the core path once the proposal is a tool call.

**Drop the runtime now and build the owned loop.** Premature. The tool-call posture is exactly what the runtime's harness features exist for, so it gets a fair, instrumented trial first. The head-to-head in section 4 decides on evidence, and the fallback is priced and ready.

## Open items

1. **Tool transport.** Native runtime tool registration versus an MCP server we host (ADR-007 open item 1), including how tenant context binds to tool calls so a run can only reach its own workspace.
2. **Interview state.** Where control-plane-held conversation state lives (operational tables), its retention, and how replay interacts with the runtime's `conversation_history` input.
3. **Allowlist mechanics.** How per-role, per-tenant tool allowlists are expressed in runtime configuration and verified in the spike.
4. **Clarifying-question UX on the operations path.** When the agent asks instead of proposing, how the question reaches the user on each surface and how the answer resumes the task.
