# Cormac security packet

The client-shareable account of how Cormac, by Serenica Digital, protects
tenant data. Written for an IT reviewer doing diligence before a pilot.

## How to read this packet honestly

Cormac is a pre-pilot prototype. This packet does not pretend otherwise.
Every claim carries one of three statuses, defined and tracked in the
[control register](control-register.md):

- **Verified** — enforced in code and proven by a cited automated test.
- **Partial** — enforced with a named gap.
- **Planned** — designed, not built. Never written in present tense.

The register is the source of truth; no doc here may claim above its
register row. A static guard (`pnpm check:controls`) keeps the register and
the test tree from drifting apart.

## Contents

| Doc | What it covers |
| --- | --- |
| [overview.md](overview.md) | What Cormac is, the trust model in one page |
| [architecture-and-trust-boundary.md](architecture-and-trust-boundary.md) | Components, the one writer, what talks to what |
| [tenant-isolation.md](tenant-isolation.md) | Row-level security, the only-writer invariant |
| [identity-and-access.md](identity-and-access.md) | Sign-in, roles and capabilities, member management, the operator tier |
| [agent-security-and-ai-data-handling.md](agent-security-and-ai-data-handling.md) | What the AI agent can reach, what it can never do, what the model sees |
| [data-handling.md](data-handling.md) | What data lives where, what leaves the browser, retention and deletion |
| [secrets-management.md](secrets-management.md) | The secret authority, key posture, demo credentials |
| [audit-and-observability.md](audit-and-observability.md) | The append-only audit trail and what it records |
| [subprocessors.md](subprocessors.md) | Third parties that touch tenant data |
| [known-gaps-and-roadmap.md](known-gaps-and-roadmap.md) | What is not built yet, stated plainly |
| [control-register.md](control-register.md) | The claim → control → test spine |

Internal operational runbooks (incident response, key rotation,
backup/restore, offboarding) live in [docs/runbooks/](../runbooks/), tracked
in the same repo but not part of the client packet.

Security reports: see [SECURITY.md](../../SECURITY.md) at the repo root.
