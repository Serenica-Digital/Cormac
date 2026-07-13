# Connectors: early thinking (parked 2026-07-13)

Status: **not a milestone**. Nothing in the beta path (ADR-0012 web, ADR-0013 SMS) depends on
this. Written down so the thinking survives the chat it happened in. Everything here is
directional; nothing is decided.

## The one settled thing this must not disturb

The agent's role is translation. It turns human input into proposed changes against the
contract; the control plane validates; a human confirms; the apply is audited. Connectors do
not get a different deal. A connector is a door: it files "here is what I saw, and where"
and everything else rides the existing pipeline.

## Three lanes (the useful split from the discussion)

1. **Dumb pipes for ingestion.** Watching a mailbox is background plumbing: per-tenant OAuth
   tokens held server-side, Gmail / Microsoft Graph push or polling, retries, backfill,
   dedupe. No agent in this loop. Most of what a connector sees needs zero intelligence
   (sender + timestamp -> last-contacted is plain code).
2. **Agent for interpretation only.** The minority of events where judgment lives ("does this
   reply mean the deal moved?") escalate to the agent, which drafts a proposal like any other
   capture. Same confirm door.
3. **MCP as a door INTO Cormac, not as the ingestion backbone.** MCP fits interactive,
   agent-in-the-loop lookups and fits us best as a surface: Cormac exposes one MCP server so a
   client's own assistant can query the book or capture an update. Using MCP to run
   continuous multi-tenant sync would put an LLM session in a job that is really ETL.
   (Assumed, not verified: the state of specific Gmail/Outlook MCP servers was not checked.)

## Prerequisite worth designing early: identity resolution

Ambient input is only useful if carter@bluewater.com resolves to James Carter at Bluewater
Holdings. The contract has no identifier-field concept today (email/phone as identity keys),
and the pipeline has no "match or create?" proposal shape. This is the one item that likely
deserves schema-level design before any connector is built, because every connector needs it
and retrofitting provenance/matching is painful. Related near-term echo: import re-runs need
external-ref dedupe (#98 deferred scope); the same idempotency mechanism should serve both.

## Cheap disciplines already worth honoring in current work

- Keep source attribution structured (channel + provenance on source messages) rather than
  growing ad-hoc channel strings.
- Build the pending-changes panel as a feed that can group/batch by source (an ambient
  connector produces volume; a flat card stack dies).

## Open questions (undesigned, deliberately)

- Auth/consent UX: mechanically standard OAuth consent (adjacent groundwork in #103), but
  scoping, visibility of what Cormac does with access, and the off switch are real design work.
- Autonomy: per-field / per-source rules for what may auto-apply vs always-confirm. Natural
  home is the contract (editableByAgent already exists), but nothing is designed.
- Timeline beyond field changes: attaching source events (an email, a call) to records even
  when no field changed. On-thesis with ADR-0010's timeline bet; unscoped.
- Hosting/queueing model for background sync; token custody details.
