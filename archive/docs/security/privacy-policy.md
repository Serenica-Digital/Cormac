# Privacy Policy

Status: stub (pending legal entity, ADR-001)
Maps to: data-flow.md, subprocessors.md, data-retention-deletion.md
Last reviewed: 2026-06-06

Blocked on: the legal entity and ownership question (ADR-001), which is the highest-ranked external risk. A privacy policy must be issued by a real entity.

## What it will draw on (already documented)

The technical substance exists across the packet and can be turned into client-facing legal language once the entity is settled:

- What data is collected and why: [data-flow.md](data-flow.md), [data-classification-and-handling.md](data-classification-and-handling.md).
- Who it is shared with: [subprocessors.md](subprocessors.md).
- How long it is kept and how deletion works: [data-retention-deletion.md](data-retention-deletion.md).
- How it is protected: [tenant-isolation.md](tenant-isolation.md), [secrets-management.md](secrets-management.md).
- AI handling: [ai-data-handling.md](ai-data-handling.md).

## To make this real

Resolve the entity (ADR-001), then have counsel turn the above into a published policy. Same dependency as [terms.md](terms.md) and [dpa.md](dpa.md).
