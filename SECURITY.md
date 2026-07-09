# Security policy

Cormac, by Serenica Digital, is pre-pilot software under active development.
We still take reports seriously.

## Reporting

Email **patmikesdev@gmail.com** with a description, reproduction steps, and
impact. You will get an acknowledgment within 3 business days. A dedicated
security address will replace this one before any pilot; this file is the
authority on where to write.

## Scope

- This repository's application code: the control plane, the web app, the
  agent tool surface, database policies and functions.
- Out of scope: the archived v0 tree under `archive/` (historical record,
  not deployed), third-party platforms (report to them directly), and social
  engineering.

## Disclosure

Give us reasonable time to fix before publishing. There is no bounty
program; we credit reporters in the fix's release notes if wanted.

## What we publish

The security posture, including its gaps, is documented honestly in
[docs/security/](docs/security/) — claims map to code and tests in the
[control register](docs/security/control-register.md).
