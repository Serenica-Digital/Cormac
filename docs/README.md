# Docs

The project's brain. Read the ADRs first; everything else dereferences them.

This file is the map and the rulebook: where each kind of doc lives, the header every doc carries, and how docs are kept honest over time.

## The map

| Folder | Holds | Authority |
| --- | --- | --- |
| [adr/](adr/) | Architecture Decision Records: the *why*. One decision per file, with the reasoning and alternatives. | The decision record. Read first. |
| [prd/](prd/) | The official *what we're building*: the current product shape and requirements. | Canonical product definition. |
| [research/](research/) | External research, each summarized with how it applies to us. | Reference, not decisions. |
| [security/](security/) | The client-facing security and compliance packet, plus the control register and QA strategy. | Shipped deliverable. |
| notes/ | Private developer space (transcripts, archive, working material). Gitignored. | Not part of the product record. |

## What lives where (so it does not sprawl again)

- A decision, or a change to a decision: a **new ADR** in `adr/`. Never edit a settled decision out of the record; supersede it with a new one and mark the old one superseded.
- The product's current shape or a requirement: `prd/`. Keep it to the canonical set below; do not accumulate drafts here.
- A summary of something external (a tool, a standard, a vendor): `research/`.
- Anything client-facing about security, or a control and its evidence: `security/`.
- Transcripts, scratch, superseded drafts, anything personal or half-formed: `notes/` (private).

If a `prd/` draft is superseded, move it to `notes/archive/` rather than leaving it next to the canonical docs.

## Document header

Every committed doc starts, right under its H1, with:

```
> **Status:** <status> · **Last reviewed:** <YYYY-MM-DD>
```

Status vocabulary: `canonical` (current source of truth), `draft` (in progress), `reference` (research/external), `superseded` (kept for history, names its replacement), `stub` (placeholder pending a dependency). ADRs use their own `**Status:** / **Date:** / **Related:**` header, which predates this convention and is compatible.

## House rules

- **No personal names in committed docs.** Use roles: "the team", "the developer", "the design partner", "the client". Names belong only in private `notes/`. (This is enforced by review; the stale drafts that violated it were archived to `notes/`.)
- **Write for the building agent.** State what is true and what is open. Cut or clearly flag superseded ideas so they do not read as current scope.
- **Tight and declarative.** No em-dashes, no "not X but Y" reversals, no forced analogies (see [../CLAUDE.md](../CLAUDE.md)).

## Index

### adr/ — decisions
See [adr/README.md](adr/README.md) for the full catalog (ADR-001 through ADR-026). Start there.

### prd/ — what we're building
- [architecture.md](prd/architecture.md) — the trust topology and component responsibilities.
- [contract-model.md](prd/contract-model.md) — how a client's spreadsheets become the governed semantic contract.
- [build-plan.md](prd/build-plan.md) — the build sequence (phases, what gates what, what's deferred).
- [requirements.md](prd/requirements.md) — numbered requirements and acceptance criteria.
- [v1-scope-architecture-matrix.md](prd/v1-scope-architecture-matrix.md) — the v1 in/deferred cut and sprint sequencing.
- [juno-platform-pilot.md](prd/juno-platform-pilot.md) — the Juno orchestration pilot outreach.

### research/ — external research, applied
Runtime, platform, connector, and compliance evaluations (Hermes, Juno, Microsoft 365, SMS/A2P, Excel sync, Anthropic skills, security/vendor risk, Supabase hardening). Each states how the finding applies to us.

### security/ — the compliance packet
See [security/README.md](security/README.md), which is itself the packet index. The spine is [security/control-register.md](security/control-register.md) (claim → control → test → status) and [security/qa-strategy.md](security/qa-strategy.md).
