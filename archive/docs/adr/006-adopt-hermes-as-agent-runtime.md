# ADR-006: Adopt Hermes as the agent runtime, behind a swappable adapter

**Status:** Seam committed (ADR-021); real Hermes integration pending. (Was: accepted as direction, pending a de-risk spike.)
**Date:** 2026-06-06
**Related:** Sits beneath ADR-005 (the control plane is the only writer) as a contained component. It runs the two roles of ADR-008, stays stateless per ADR-009 (govern learning as data), exposes the provider seam of ADR-013 (Claude-first, BYOK), and is treated as a containment workstream in ADR-015 (security). ADR-017 (Juno) is where this runtime runs in the prototype, and the two share one de-risk spike. ADR-021 reports the result of that spike: the adapter seam is validated and committed, with real Hermes integration still open. The full source-verified evaluation is [docs/research/hermes-agent-runtime-evaluation.md](../research/hermes-agent-runtime-evaluation.md).

## Context

The product needs an agent execution layer: the LLM and tool loop, skills, model routing, and the plumbing to run scheduled and message-triggered work. The choice is build or adopt. NousResearch Hermes Agent (MIT-licensed, roughly 84% Python on FastAPI and SQLite, self-hosted, v0.16 at review with near-daily releases) already is much of what we would otherwise build, and the integration mechanics our design depends on were verified against the repo source, not secondary write-ups.

What it gives us: model-agnostic provider routing (Claude, OpenAI, Gemini, local, OpenRouter), which is the provider seam of ADR-013 already built; skills as markdown `SKILL.md` files, which is the semantic-layer-as-prose pattern from the Anthropic work; Twilio SMS and email gateways and a cron scheduler, which match our surfaces and the weekly report; MCP in both directions; rich per-session provenance in a local `state.db` (model, system prompt, every tool call with args and results, token and cost breakdown, and MCP calls persisted identically to native ones), which is a clean source for our audit ingestion; and a `finance-excel-author` skill adapted from Anthropic's own `xlsx-author` and `audit-xls` skills, whose "provenance lives in the artifact" conventions transfer directly to our Excel-facing outputs and compliance story.

It is also young, and honest about it: its own `SECURITY.md` calls it "a single-tenant personal agent," with no core audit-logging or tenant-isolation primitives, and there are no documented multi-tenant or client-facing production deployments.

## Decision

Adopt Hermes as the agent execution runtime only, behind a swappable Agent Runtime Adapter.

### 1. Responsibility split

| Concern | Hermes runtime (adopted) | Our control plane (we build and own) |
| --- | --- | --- |
| LLM and tool loop | Yes (`POST /v1/runs`) | Decides when to invoke and with what input |
| Skill loading and model routing | Yes | Authors the tenant skills; owns billing mode and which key a tenant gets |
| Per-tool veto and mid-run approval | Yes (`pre_tool_call` block; native `/v1/runs/{id}/approval`) | Registers the hook; decides approve or deny; ties it to our proposal pipeline |
| Per-run provenance | Yes (`state.db`) | Reads it post-run into our audit log |
| Tenant routing and RBAC | No | Ours |
| Schema-contract validation and publishing | No | Ours, the semantic layer is our IP |
| Structured-output guarantee at the request boundary | No over HTTP | Ours, Zod at the boundary |
| Proposal, confirmation, and audit pipeline | No | Ours |
| Canonical state, multi-tenancy, billing, webhooks | No | Ours |

### 2. The integration seam, verified

There is no `response_format` or JSON-schema parameter on `/v1/runs` (confirmed by source), so the HTTP path is instruct-and-parse: prompt for JSON, then Zod-validate at our boundary, treating all output as untrusted. Schema-enforced JSON is available inside a skill via `ctx.llm.complete_structured(json_schema=..., temperature=0.0)`, which is our stronger option if instruct-and-parse proves too loose. Two real write-gate mechanisms exist: the `pre_tool_call` hook can block a tool before execution and hand us its structured args as the proposed change, and the native approval endpoint pauses a run for an approve-or-deny decision. We design on these two, not on the documented-but-unwired `pre_llm_call` and session hooks.

### 3. Stateless per task, on warm recycled workers

Run a fresh stateless session per task with persistent runtime memory off. Keep workers warm so the runtime's own overhead disappears into the multi-second LLM latency, and recycle workers on a schedule or after N runs to defeat the memory leak. Reserve true ephemeral containers for genuinely untrusted input (an unknown uploaded workbook) and heavy async batch jobs where latency is irrelevant. "Stateless per task" is a session property and must not be conflated with cold-container-per-task, which would add a real latency tax for no benefit.

### 4. Contained, reversible, and spiked before commitment

The adapter defines the runtime contract: tenant context in, structured proposal out, all output untrusted. Because the boundary is swappable and the license is MIT, the worst case is a contained swap or a fork at a pinned version, not a dead project. A one-to-two-day de-risk spike proves the seam end to end before estimates are committed: Hermes in a container with bearer auth, one tenant skill, one workbook-derived contract, one natural-language update interpreted into Zod-valid JSON, a stored proposal with real provenance, both write-gate paths stopping a write, and a stateless plus injection-containment check with measured cold, warm, and end-to-end latency. The preferred place to run this spike, and the runtime itself, is a Juno workload behind the adapter; ADR-017 covers the platform side of the same exercise, so the seam and the deployment are proven together rather than in two disconnected spikes.

## Risks accepted

- **P1 memory leak (issue #25315, unpatched at review).** A long-running gateway grows to tens of gigabytes and OOM-crashes within roughly a day. This is fatal for the naive long-running per-tenant gateway pattern, which is why the decision is stateless-per-task on recycled warm workers, and why a version is pinned and the fix tracked.
- **Persistent memory injection (Repello AI threat model).** Summarized untrusted content can poison the SQLite memory and persist across sessions. Our inbound SMS and email is exactly this case. Mitigated by persistent memory off, a fresh session per task, and the Zod gate (ADR-009 makes "memory off" safe by relocating learning into governed data).
- **CVEs.** Auth bypass, credential pool, Starlette, and a path-traversal advisory, some patched. Track advisories and pin patched versions.
- **Design-center mismatch.** Hermes is built as a persistent, self-improving personal agent. We run it as a stateless headless executor against its grain, with memory and gateways off. Features we want may be under-supported and features we do not want may be load-bearing.

## Alternatives considered

**Build a thin owned Node/TS agent loop.** Model call, tool dispatch, structured output, audit, borrowing Hermes's best patterns. Cleanest control, zero churn, no grain-fighting, but more to build and no free breadth. Kept as the live fallback if the spike sours, and the honest conservative play for the agent layer specifically.

**GoClaw, a Go reimplementation that is purpose-built multi-tenant** (row-level Postgres isolation, RBAC, injection detection, sub-second startup). Rejected because its license is CC BY-NC 4.0 (non-commercial), which a commercial SaaS cannot use. It is a useful signal that the market expects the enterprise multi-tenant layer Hermes lacks, which is exactly our control plane.

**One shared Hermes instance for all tenants.** Cheapest. Rejected for weak isolation: a single server with one bearer key cannot distinguish tenants by request, and shared in-process memory is the worst place for the most sensitive per-client knowledge.

## Confidence and where the risk budget goes

Roughly 65% that Hermes is the right choice for the agent layer specifically, and roughly 90% that adopting it is safe and reversible given the swappable boundary and the MIT license. The gap is the design-center mismatch and the 0.x churn. The reframe that matters: the runtime is contained and reversible, so it is not where a large risk budget should be spent. Spend boldness on the genuinely high-variance product bets (the contract-first generic engine, multi-tenancy, the write-back loop) and make the runtime call on plain engineering grounds. The spike collapses most of the remaining uncertainty for one to two days of work.

## Open items

1. **Scale tenancy.** Shared warm pool (better economics and latency) versus per-tenant instances (stronger isolation), and how to guarantee zero in-process cross-tenant bleed in a shared pool.
2. **Structured-output path.** Standardize on the `complete_structured` skill versus instruct-and-parse for the proposal path (shared with ADR-013).
3. **Recycle cadence**, time-based versus after-N-runs, and whether the leak is patched before it matters.
4. **The spike result.** Reported in ADR-021: the adapter seam is validated and committed (structured output rejected or accepted at the boundary, the full spine running against real Postgres). The real-Hermes half (the in-run write gates, latency, model adherence to structured output, the leak mitigation, and the Juno deploy) remains open.
