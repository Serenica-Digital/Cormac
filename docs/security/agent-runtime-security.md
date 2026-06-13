# Agent Runtime Security

Status: drafted
Maps to: control-register rows 3, 4, 5, 6, 19, 20, 21, 22
Last reviewed: 2026-06-10

The hardest question a reviewer asks about an AI that proposes writes is how it is stopped from making them unsafely. This is the answer, and it is structural, not hopeful. ADR-015 names this the special workstream; ADR-025 set the posture and ADR-026 proved it live.

## The architecture in one paragraph

The runtime is NousResearch Hermes Agent, pinned by version, running stateless per task with memory off. The agent works each task through exactly four tools the control plane serves over MCP: read the active contract, search records, get a record, and submit a proposal. It holds no database credentials and has no other reach into CRM data. The terminal action of a successful run is the `submit_proposal` tool call; the control plane validates it and holds it pending. Nothing the agent does becomes a write without passing the control plane's gate and, under confirm-each policy, a human decision.

## The containment controls

- **No database credentials.** The runtime is configured with no Supabase env ([compose](../../docker/compose.yaml)); only the control plane holds the service key. It cannot write even if it tried (register rows 2, 3).
- **The tool surface is authenticated and tenant-bound.** Every tool call carries a workspace-scoped bearer token, compared timing-safe; the token is the tenant binding, so a run can reach only its own workspace ([mcp/routes.ts](../../apps/api/src/mcp/routes.ts); register row 19, proven in [tests/integration/mcp-tools.test.ts](../../tests/integration/mcp-tools.test.ts)).
- **Tools are allowlisted and workspace-scoped.** The runtime profile lists exactly the four operations-agent tools; the control plane serves nothing else, and every tool query filters by workspace ([config.yaml](../../docker/hermes-runtime/config.yaml), [mcp/server.ts](../../apps/api/src/mcp/server.ts); register row 20).
- **The only write path is a gated proposal.** `submit_proposal` validates shape (Zod) and contract (every field must exist, be the right type, and be agent-editable), holds at most one `pending` proposal per task (a unique index enforces it under retries), and never applies anything. A proposal touching a human-only field is rejected and not held (register rows 4, 21; [validate.ts](../../packages/contract/src/validate.ts)).
- **Malformed runtime output is rejected, never written.** The adapter treats every response as untrusted; failures map to typed errors and the run is stopped and its session deleted on every terminal path ([adapter/runtime.ts](../../apps/api/src/adapter/runtime.ts), register row 5).
- **Minimized, sensitivity-aware context.** The agent retrieves context through its tools, and fields a tenant marked `sensitive` are excluded from tool results by construction ([redact.ts](../../packages/contract/src/redact.ts); register row 6).
- **No terminal, no gateways, no memory.** The tool allowlist excludes the runtime's terminal; a `pre_tool_call` deny hook vetoes it as a second layer (register row 22). Messaging gateways stay off (no platform tokens), persistent memory and user profiling are off, and the adapter deletes the runtime session after every run, so the runtime retains nothing about a task (ADR-009, ADR-026).

## Proven live (ADR-026)

The integration spike demonstrated containment at three independent layers: the agent itself declined a human-only-field instruction by citing the contract and identified a planted prompt-injection attempt; the mechanical server gate rejected human-only writes and duplicates regardless of agent behavior; and the deny hook vetoed a live terminal attempt. The runtime held no database credentials at any point, and 6 of 6 proposals were schema-valid at the tool layer on first submit.

## Still open (tracked)

- A CI test for the deny hook; today its evidence is the manual spike run (#44).
- Log scrubbing applied at every site that could log runtime I/O (#41; see [secrets-management.md](secrets-management.md)).
- Per-run minted tool tokens (the spike uses a static workspace-bound token per deployment; fine for one tenant, revisit before multi-tenant).
