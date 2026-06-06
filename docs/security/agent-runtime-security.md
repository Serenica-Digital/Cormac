# Agent Runtime Security

Status: drafted
Maps to: control-register rows 3, 4, 5, 6
Last reviewed: 2026-06-06

The hardest question a reviewer asks about an AI that proposes writes is how it is stopped from making them unsafely. This is the answer, and it is structural, not hopeful. ADR-015 names this the special workstream.

## The containment controls

- **No database credentials.** The runtime is configured with no Supabase env ([compose](../../docker/compose.yaml)). It cannot write even if it tried. The control plane is the only writer.
- **Output is untrusted and shape-validated.** The control plane reaches the runtime over HTTP and rejects any response that is not a well-formed proposal before anything is held ([adapter/runtime.ts](../../apps/api/src/adapter/runtime.ts)). Proven in [runtime.test.ts](../../apps/api/src/adapter/runtime.test.ts): malformed output and error responses are rejected, never written.
- **Output is contract-validated.** Even a well-formed proposal is checked against the active contract: every field written must exist, be the right type, and be agent-editable. A proposal touching a human-only field is rejected ([validate.ts](../../packages/contract/src/validate.ts), proven in [validate.test.ts](../../packages/contract/src/validate.test.ts)).
- **Minimized, sensitivity-aware context.** The runtime receives only what it needs: the contract, the message, and minimized record summaries. Fields a tenant marked `sensitive` are excluded from that context by construction ([redact.ts](../../packages/contract/src/redact.ts), proven in [redact.test.ts](../../packages/contract/src/redact.test.ts)).
- **Stateless per task.** The runtime carries no cross-tenant memory; per-tenant learning lives as governed data in the control plane, never in runtime memory (ADR-009). Statelessness is itself a security control.

## Why the stub does not weaken this

The runtime today is a deterministic stub. The containment controls above are properties of the control plane and the boundary, not of the model, so they hold identically when real Hermes replaces the stub. The stub even models a misbehaving runtime: asked to set a rating, it tries to write the human-only `internal_rating`, and the control plane rejects it. That is the gate working end to end.

## Still to build (tracked)

- A per-tenant tool allowlist (the runtime's available tools scoped per workspace). Designed in ADR-015, not yet built.
- A pinned runtime version and container-isolation evidence once real Hermes lands.
- Log scrubbing applied at every site that could log runtime I/O (the masking helper exists; see [secrets-management.md](secrets-management.md)).
