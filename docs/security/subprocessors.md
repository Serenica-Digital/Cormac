# Subprocessors

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

Third parties that store or process tenant data, and what each sees. Terms
marked **to confirm** have not been verified against current provider
documentation and are not asserted; confirming them is a named pre-pilot
task.

| Provider | Role | What it touches | Terms status |
| --- | --- | --- | --- |
| Supabase | Managed Postgres + identity broker (staging and beyond) | All tenant data at rest; auth identities | Plan tier and backup posture **to confirm** |
| Model provider(s) via the Hermes runtime | Agent inference | Utterances, contracts, non-sensitive identity fields, workbook detection profiles (sensitive-flagged values excluded, register row 17) | Training/retention terms **to confirm before pilot**; will be recorded here with dates, never from memory |
| Infisical | Secret management | Operational secrets only; no tenant data | **to confirm** |
| GitHub | Source hosting | Code and docs; no tenant data | — |
| Microsoft Entra / Google | OAuth identity providers | The user's identity claims at sign-in; no business data | Standard OAuth; app registrations pending |

Development-only substrates (the local stack, the Juno compute platform, the
dev-lane model) never hold client data; development runs on fixtures and
seeded demo data only.

This table changes by PR like any control change (ADR-0011); a pilot
agreement will reference the version in effect.
