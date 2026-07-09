# Data handling

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

## What data lives where

| Data | Where | Protection |
| --- | --- | --- |
| Business records | Postgres, `business_records` | RLS (row 1), only-writer (row 2), contract-defined shape |
| Contracts | Postgres, versioned | Atomic publish gate (row 16) |
| Utterances (what users tell Cormac) | Postgres, `source_messages` | RLS; linked to proposals and audit |
| Audit trail | Postgres, `audit_events` | Append-only (row 14), unredacted by design |
| Parsed workbook grids | The user's browser (localStorage) | Stays on the device; unencrypted at rest in the browser profile |
| Workbook detection profiles | Postgres, `workbook_snapshots` | RLS; sample-limited (below) |
| Agent token hashes, operator flags | Postgres | RLS with zero policies; service-role only |

## The workbook boundary, stated precisely (row 26 — Partial)

This is the claim most likely to be misread, so it is stated exactly:

- The spreadsheet file (`.xlsx`) is parsed **in the browser** and never
  uploaded anywhere.
- What uploads is a **detection profile**: sheet and column names, inferred
  types, fill rates, **up to 3 sample values per column and up to 2 sample
  rows per sheet**. Sample values are real cell contents. A client who
  considers any column's values sensitive should know a few of them will
  reach the server (and, during the setup interview, the model).
- The parsed grid persists **unencrypted in browser localStorage** so the
  interview can highlight columns. It stays on the client's device and
  browser profile; clearing site data removes it.

Status is Partial: the behavior is verified by code review, and detection
correctness has a test, but no automated test pins the boundary itself.

## Log hygiene (row 18 — Partial)

A tested masking helper exists for any log-bound copy of record data.
Today's logging is HTTP-level only, so no record values are logged — but
nothing enforces that at log sites yet. Named gap.

## Retention and deletion (row 19 — Partial)

Records live until the tenant offboards. Offboarding uses the sanctioned
`purge_workspace` path — the only deletion the append-only audit trigger
honors — which removes the workspace and all dependent rows in one cascade;
auth identities are deleted separately. Procedure:
[docs/runbooks/workspace-offboarding.md](../runbooks/workspace-offboarding.md).
No automated retention schedules exist yet (Planned).

## Legal artifacts

DPA, privacy policy, and terms are **Planned** — drafted for v0, not yet
re-issued for the rebuild. They are named here so their absence is explicit,
not discovered.
