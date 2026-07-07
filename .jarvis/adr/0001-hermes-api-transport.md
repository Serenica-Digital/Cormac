# 0001 — The control plane drives Hermes via its API server; MCP is never internal plumbing

- **Status:** Accepted (2026-07-07)
- **Supersedes (in spirit):** v0 ADR-005/007/025/026 (`archive/docs/adr/`), which routed
  all agent communication through an internal MCP tool surface.

## Context

v0 died partly of a trust-boundary misconception: MCP (the transport) was treated as the
security mechanism, so every agent capability became a serialized MCP round-trip. The
boundary that actually held was authority: workspace-scoped tokens, RLS, the runtime
holding no write credentials, and a schema-validated proposal gate. The cost of the
transport mistake was measured: moving one MCP fetch into Hermes's cached `instructions`
seam cut runs from ~5 tool calls / 21s / $0.045 to 2-3 calls / 8-15s / ~$0.03
(v0, ADR-027 work). The sibling Jarvis project then proved the correct transport live.

## Decision

The control plane is the only client of the Hermes runtime, over Hermes's own HTTP API:

- **Interactive multi-turn** (the authoring interview): `POST /v1/responses` with a named
  `conversation` (server-side state, prefix-cache stable).
- **Gated/async work**: `POST /v1/runs`, events via the `/v1/runs/{id}/events` SSE stream
  (tool starts, `approval.request` with command/description/choices), resolution via
  `POST /v1/runs/{id}/approval` (`{"choice": "once|session|always|deny"}`).
- Compiled workspace context rides the `instructions` field (cache-stable prefix).
- The runtime is network-private: `API_SERVER_KEY` required, reachable from the control
  plane only. Surfaces never touch it.
- MCP appears only as an optional outward-facing product surface (e.g. a Claude
  connector), never as the path between our own components.

**Verified** (Jarvis project, live on Hermes 0.17, 2026-06-20/21): round-trip with agent
loop and 17k-token SOUL+skills load in ~4s; named-conversation persistence across calls;
approval gate pausing a run and resolving both approve and deny; `hermes mcp serve`
confirmed to be a messaging bridge that does not run the agent loop. Operational gates:
API server is opt-in (`API_SERVER_ENABLED` + `API_SERVER_KEY` in the profile `.env`);
`terminal` is per-platform and off for `api_server` by default; `approvals.timeout` must
be human-paced (1800s, not the 60s default).

## OPEN seam (deliberately not decided here)

How the agent reaches data mid-run: **tools bundled in the Hermes profile** vs **MCP
callback to the control plane**. Owned by the keystone spike (ADR-0002); whichever wins,
the write path remains the schema-enforced proposal gate.

## Consequences

- The agent's reasoning power is no longer bounded by an internal tool-serialization
  layer; latency and cost drop by construction.
- We inherit Hermes's operational surface (per-platform toolsets, approvals config, SSE
  observability) as deploy-time configuration, documented above as verified.
- The control plane must own run lifecycle (submit, stream, approve, timeout) as a
  first-class module.

## Alternatives considered

- **Internal MCP tool surface as the channel (v0's design):** rejected on measured cost
  and on the misconception it encoded; also fragile (v0's runtime lost its MCP connection
  permanently when the API restarted).
- **Direct Anthropic API calls from the control plane (no Hermes):** rejected for v2
  scope; Hermes provides the agent loop, tool harness, approvals, and session state we
  would otherwise rebuild. Revisit only if Hermes becomes the bottleneck.
