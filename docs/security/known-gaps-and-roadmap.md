# Known gaps and roadmap

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

Listed plainly, because a gap named here qualifies claims elsewhere and a
gap discovered by a reviewer costs more than one disclosed.

## Gaps that qualify Verified claims

- **Tests exercise the HS256 token branch only.** Local Supabase signs
  HS256; staging+ verifies ES256 via the JWKS. The ES256 path is proven
  manually against the managed project, not in the suite. Narrowed
  structurally: prod-like environments refuse HS256 entirely (row 8).
- **Agent submissions are not audited.** The trail records decisions and
  applied changes, not the agent's proposal submission itself
  (`actor_type='agent'` unused). Carried from v0.

## Partial controls, with the missing piece

| Register row | Missing piece |
| --- | --- |
| 3 (runtime holds no DB creds) | An automated env lint over the gateway profiles |
| 18 (log masking) | The tested helper is applied at zero log sites; log-site enforcement |
| 19 (deletion path) | A dedicated test that a non-service caller is refused |
| 21 (no internals in responses) | A dedicated error-handler/CORS test (v0 had one; port it) |
| 22 (secret hygiene) | Automated secret scan + env lint (v0 had both; port them) |
| 23 (demo creds local-only) | A test on the host guard itself |
| 26 (workbook boundary) | An automated pin on what the detection profile uploads |

## Not built (Planned; the packet never claims these)

- **Rate limiting** (row 24). In the old architecture diagram, not in code.
- **Backups and restore drill** (row 25). Staging backup tier to confirm; no
  drill has been run.
- **Metrics, alerting, log retention.**
- **CI.** All gates (tests, lint, the register guard) run manually by
  decision this round; wiring CI is a fast follow.
- **SAML/enterprise SSO.** Rides the same identity broker if a pilot needs it.
- **DPA / privacy policy / terms** for the rebuild.
- **SMS/email/Excel surfaces** and their compliance posture (A2P, Graph
  permissions) — not wired in v2 yet.

## Pre-pilot checklist (the shortest honest list)

1. Confirm and record model-provider and Supabase terms in
   [subprocessors.md](subprocessors.md).
2. Custom SMTP + OAuth app registrations on staging (PR #89 action items).
3. Run one restore drill; record it in the backup runbook (row 25).
4. Port the secret scan, env lint, and error-handler test from v0
   (rows 21-22).
5. Stand up CI so Verified means continuously verified.
6. Rate limiting on capture and auth-adjacent routes (row 24).
