# AI Data Handling

Status: drafted
Maps to: control-register rows 6, 14
Last reviewed: 2026-06-06

What client data the AI sees, where it goes, and how it is bounded (ADR-013, ADR-015).

## What is sent to the model

For each task the control plane sends the model: the user's message, the active contract (field definitions and labels, which is schema, not tenant data), and minimized record summaries for matching. It does not send the full record set, audit history, or secrets.

## The sensitivity boundary

Fields a tenant's contract marks `sensitive` are never placed in the model context, even when they are also identity fields used for matching. The agent matches on non-sensitive identity fields; sensitive values stay inside the control plane and the database. Enforced by `buildContextDisplay` ([redact.ts](../../packages/contract/src/redact.ts)) and proven in [redact.test.ts](../../packages/contract/src/redact.test.ts).

## Provider, training, retention

- **Provider:** Claude (Anthropic) by default, behind a thin provider seam (ADR-013). Not model-agnostic in v1; the seam preserves future options.
- **Training:** under standard Anthropic API terms, API data is not used to train models.
- **Retention:** provider-side retention follows the provider's API terms; confirm the current window and record it here before a pilot.
- **Metadata logged:** which model and version, token counts, timestamps, and the task context (tenant, user, intent, result) for audit. Not the sensitive content.

## Billing modes and keys

Three modes (ADR-013): platform-bundled (default; Serenica Digital holds the key), BYOK (client's own key), and in-tenant endpoint (later, for higher-trust buyers). BYOK key protection (encrypted at rest, never logged, rotation path) is a `pending` control until the billing connector is built; see [secrets-management.md](secrets-management.md).

## Why not BYO-AI

The product is the tuned reasoning, skills, and version governance, so the customer's generic model is not made the engine. The thick MCP surface (ADR-007) lets a client's Claude call our safe tools instead; BYOK satisfies the "my own billing" motive without giving up accuracy control.

## Open items

- Confirm and record the provider retention window before a pilot.
- Per-feature data-field inventory (which fields each surface sends) as surfaces land.
