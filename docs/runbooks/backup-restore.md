# Runbook: backup and restore

Internal. Honest state: **no restore has ever been drilled** (control
register row 25, Planned). This runbook holds the procedure so the drill has
a script; running it flips the row.

## What holds state

Postgres is the only stateful store. The runtime is stateless per task;
browser localStorage is a per-device cache the product can lose freely.

## Local (development)

Disposable by design. `supabase stop` snapshots to a Docker volume;
`supabase db reset` + `pnpm seed:demo` rebuilds a working world in minutes.
Never treat local as needing backup.

## Staging / pilot (managed Supabase)

- **To confirm and record here:** the project's plan tier and with it the
  backup schedule and PITR availability. Do not assume; check the dashboard
  and write it down with a date.
- Migrations are re-runnable from the repo (`supabase/migrations`), so a
  restore needs data, not schema archaeology.

## The drill (run before any pilot)

1. Note the time; capture row counts per tenant table.
2. Restore the most recent backup into a **fresh** project (never over the
   live one).
3. Point a local control plane at the restored project (Infisical staging
   slot overrides); run the isolation suite against it.
4. Compare row counts; sign in as a persona and walk the app.
5. Record duration and result here; file divergences as issues.

Result log:

| Date | Backup age | Restore time | Outcome |
| --- | --- | --- | --- |
| — | — | — | not yet run |
