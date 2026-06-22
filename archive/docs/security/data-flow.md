# Data Flow

Status: drafted
Maps to: control-register rows 2, 6, 7, 19-21
Last reviewed: 2026-06-10

Where client data enters, where it rests, which subprocessors see it, and how it leaves. Subprocessor detail in [subprocessors.md](subprocessors.md); AI specifics in [ai-data-handling.md](ai-data-handling.md).

## Enters

- A user message via web, SMS, email, Excel round-trip, or Claude/MCP. The control plane records it as a source message (channel, sender, user, content, timestamp).
- A workbook upload during contract authoring (schema and sample values).

## Rests

- All business records and operational rows live in Supabase/Postgres, every tenant row tagged with `workspace_id`, behind RLS.
- The append-only audit trail holds before/after values and source links.
- Each agent run's identity and token/cost counts are stored on its source message (counts only, no content). The runtime itself retains nothing: it holds task state only for the run's duration, and the control plane deletes the runtime session after every run (ADR-026).
- Secrets live outside the database in the deployment environment, never in code (see [secrets-management.md](secrets-management.md)).

## Leaves (to subprocessors)

- **To the model provider (Anthropic by default)**: the user's message, the active contract (schema, not tenant data), and the record context the agent retrieves through the control plane's tools (search, get-record). Tool results are minimized summaries that exclude sensitive field values by construction ([redact.ts](../../packages/contract/src/redact.ts), enforced in [repo.ts](../../apps/api/src/repo.ts) and served only through the tenant-bound tool surface, register rows 19-20). See [ai-data-handling.md](ai-data-handling.md).
- **To Twilio / email / Microsoft Graph**: only when those surfaces are enabled, and only the data needed for that channel. Each is gated by a per-surface security review.

## The minimization guarantee

The model never receives a field a tenant marked `sensitive`, even if that field is also used for matching. The agent matches on non-sensitive identity fields; sensitive values stay inside the control plane and the database. This is tested in [redact.test.ts](../../tests/unit/redact.test.ts).

## Audit, not logs

The audit trail intentionally retains true before/after values, because it is the record of what happened. It lives in the database under RLS, not in application logs. Application logs today carry HTTP and error metadata, not record values; enforced masking at every log site is in flight, not done (register row 13, tracked as #41), so this doc does not claim it.
