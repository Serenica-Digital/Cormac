# Data Flow

Status: drafted
Maps to: control-register rows 2, 6, 7
Last reviewed: 2026-06-06

Where client data enters, where it rests, which subprocessors see it, and how it leaves. Subprocessor detail in [subprocessors.md](subprocessors.md); AI specifics in [ai-data-handling.md](ai-data-handling.md).

## Enters

- A user message via web, SMS, email, Excel round-trip, or Claude/MCP. The control plane records it as a source message (channel, sender, user, content, timestamp).
- A workbook upload during contract authoring (schema and sample values).

## Rests

- All business records and operational rows live in Supabase/Postgres, every tenant row tagged with `workspace_id`, behind RLS.
- The append-only audit trail holds before/after values and source links.
- Secrets live outside the database in the deployment environment, never in code (see [secrets-management.md](secrets-management.md)).

## Leaves (to subprocessors)

- **To the model provider (Anthropic by default)**: the user's message, the active contract (schema, not tenant data), and minimized record context for matching. Sensitive field values are excluded from this context by construction ([redact.ts](../../packages/contract/src/redact.ts), enforced in [repo.ts](../../apps/api/src/repo.ts)). See [ai-data-handling.md](ai-data-handling.md).
- **To Twilio / email / Microsoft Graph**: only when those surfaces are enabled, and only the data needed for that channel. Each is gated by a per-surface security review.

## The minimization guarantee

The model never receives a field a tenant marked `sensitive`, even if that field is also used for matching. The agent matches on non-sensitive identity fields; sensitive values stay inside the control plane and the database. This is tested in [redact.test.ts](../../packages/contract/src/redact.test.ts).

## Audit, not logs

The audit trail intentionally retains true before/after values, because it is the record of what happened. It lives in the database under RLS, not in application logs. Application logs are masked for sensitive values.
