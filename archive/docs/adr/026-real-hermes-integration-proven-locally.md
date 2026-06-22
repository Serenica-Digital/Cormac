# ADR-026: Real Hermes runs the operations agent; the ADR-025 posture is proven locally

**Status:** Accepted (reports the integration spike result; the local half of ADR-006's runtime integration is committed, the Juno deployment half stays open under ADR-017)
**Date:** 2026-06-10
**Related:** Completes the arc ADR-021 left open ("real Hermes behind the adapter" and the real write-gate mechanisms). Proves the ADR-025 posture live and resolves its open items 1 (tool transport) and 3 (allowlist mechanics). The deployment half of the original ADR-006/ADR-017 spike remains with ADR-017. Memory stays off per ADR-009; the model is Claude Sonnet 4.6 per ADR-013.

## Context

ADR-021 committed the runtime seam but was explicit that everything about the real runtime was unproven: real Hermes behind the adapter, the in-run write gates, structured-output reliability from a real model, latency, statelessness. ADR-025 then corrected the posture those questions get answered under: the operations agent runs as a real tool-using agent, retrieves its own context through tools, and finishes by calling `submit_proposal`, a schema-enforced tool the control plane executes.

This ADR reports the integration spike, run 2026-06-10 on the local compose stack: pinned `nousresearch/hermes-agent:v2026.6.5` headless (`gateway run`), the profile versioned in `docker/hermes-runtime/` (memory off, the four-tool MCP allowlist, a `pre_tool_call` deny hook), the control plane serving the tools at `/mcp` over streamable HTTP with a workspace-scoped bearer token, and the adapter speaking the Runs API. Twelve agent tasks were executed end to end through the real capture endpoint, plus two direct gate-demonstration runs.

## Decision

Commit the local Hermes integration as proven. Record the measurements as the baseline for the deferred owned-loop comparison, and the operational findings as constraints the deployment must respect.

### 1. What the spike proved

- **The whole chain runs.** A natural-language update enters capture, the adapter submits a run, the agent reads the contract and finds records through the control plane's MCP tools (34 `/mcp` requests served in the first verified run), submits through the write gate, the proposal is held pending, approval writes the record and the audit event with before/after and the source link. The runtime held no database credentials at any point.
- **Tool-argument schema adherence: 6 of 6 proposals valid on first submit.** Every proposal carried the exact record UUID learned via `search_records` (the brief contains no IDs), only evidence-backed fields, and clean notes and rationale. No retry loops were observed. This answers ADR-021's "structured-output reliability from a real model" for the tool-call path: the schema is enforced at the tool layer, and the model met it every time.
- **Latency.** Proposal-producing runs: 15.5 to 18.4 seconds end to end through capture. Clean declines: 3.3 to 9.3 seconds. Synchronous capture holding the HTTP request for ~17 seconds is acceptable for the spike and wrong for production surfaces; the async shape (accept, then notify) is already implied by ADR-007 and stays open.
- **Cost (Sonnet 4.6).** $0.038 to $0.042 per proposal run warm ($0.10 for the first cold-cache run), roughly $0.02 per decline, 4 to 6 model calls and ~74k cache-read tokens per proposal run. At pilot volumes this is cents per day per seat.
- **Containment held at three layers, each demonstrated separately:**
  1. *Agent layer (SOUL + contract).* The agent declined a human-only-field instruction by citing `editableByAgent: false` from the contract it fetched; it identified a fake "system notice" claiming the contract had changed as a prompt-injection attempt and refused; it refused a literal-compliance social-engineering framing ("the test requires you to skip your rules").
  2. *Server gate (mechanical, model-independent).* `submit_proposal` executes inside the control plane: human-only writes are rejected and nothing is held, duplicates per task are blocked, unknown tasks are rejected, auth is a workspace-bound token. Proven by the Phase 1 test suite and direct tool calls; the agent's good behavior above means this gate was never even reached in live runs.
  3. *Runtime hook (`pre_tool_call`).* A run instructed to use the terminal attempted it and was vetoed by the profile's deny hook; the agent received and reported our exact block message.
- **The posture flags are honored.** Memory and user profile off (verified in the migrated config), messaging gateways silent with no platform tokens, `memory_write_api: false`, and statelessness is now enforced rather than assumed: the adapter deletes the runtime session after every terminal run, verified live (zero open sessions after a capture).

### 2. Operational findings (constraints the deployment inherits)

- **Completed runs hold their sessions, and open sessions count against the runtime's 10-concurrent-run cap.** Untreated, a runtime stops accepting work after ten tasks. The adapter now deletes the session (`DELETE /api/sessions/{id}`) after every terminal outcome and stops the run first on timeout; the 429 surfaces as `runtime_busy` (503) to callers. Scheduled recycling (the ADR-017 question to Juno) remains the backstop, for the upstream memory leak and for anything cleanup misses.
- **Image mechanics, all encoded in `docker/compose.yaml` and `docker/hermes-runtime/`:** the default CMD is an interactive CLI that exits headless, so the service runs `gateway run` through the image's wrapper; the config migrator rewrites `config.yaml` in place, so the profile is copied into the data volume at start, never bind-mounted read-only; hooks require `HERMES_ACCEPT_HOOKS=1`; the model must be set explicitly (`model: claude-sonnet-4-6`); `${VAR}` env interpolation in config is verified, so the MCP URL and workspace token stay out of the on-disk file.
- **Benign noise:** auxiliary-provider warnings (openrouter, nous) on every run; no functional effect with Anthropic as the only provider.
- **Session continuity exists upstream** (`conversation_history` on submission, session resume headers) for the multi-turn work ADR-025 open item 2 defers; nothing in this spike forecloses either mechanism.

### 3. What remains open

- **Juno deployment (ADR-017):** GHCR-published images, the baked runtime image, managed Supabase wiring. The artifacts are the next increment; the session with Juno proves them.
- **Clarifying-question UX (ADR-025 open item 4):** today a decline returns `no_proposal` with the agent's final text; how that reaches each surface and how an answer resumes the task is undesigned.
- **Multi-turn state (ADR-025 open item 2)** and the governed learning loop (typed learning slots through the proposal pipeline instead of runtime memory; design discussed 2026-06-10, to be tracked on the board).
- **The owned-loop comparison** (deferred by decision until after the Juno session): these measurements are its baseline.
- **`search_records` is a naive substring scan** over at most 200 record summaries. Sufficient for the demo workspace, not for a real book of business; upgrading it is the first post-spike tool-surface change, with Phase 4-style measurements as the evidence.

### 4. Status changes

- **ADR-006** moves from "seam committed, runtime integration pending" to **runtime integration committed locally; deployment pending (ADR-017)**.
- **ADR-025** open items 1 and 3 are resolved: the tool transport is an MCP server hosted by the control plane (streamable HTTP, stateless mode, workspace-scoped bearer token as the tenant binding), and allowlists are expressed as the profile's `mcp_servers.<name>.tools.include` list plus the control plane serving only that role's tools. Items 2 and 4 stay open.
