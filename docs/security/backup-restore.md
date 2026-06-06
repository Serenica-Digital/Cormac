# Backup and Restore

Status: stub (pending tested drill)
Maps to: control-register row 17
Last reviewed: 2026-06-06

Blocked on: a real database to run a restore drill against (local Supabase was down at authoring time).

## Intended content

- Backup schedule and mechanism (Supabase-managed; confirm plan tier and frequency).
- A documented, tested restore procedure: restore to a clean environment and verify that RLS policies and the audit trail survive intact.
- Recovery targets (RTO/RPO) appropriate to a private pilot.
- Owner and runbook.

## To make this real

1. Take a backup of the pilot database.
2. Restore it to a separate environment.
3. Run [tests/isolation.test.ts](../../tests/isolation.test.ts) against the restored instance to confirm isolation and append-only audit still hold.
4. Record the steps, timings, and owner here, and flip control-register row 17 to a real status.
