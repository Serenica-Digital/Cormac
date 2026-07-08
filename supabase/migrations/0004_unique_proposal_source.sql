-- One runtime task may hold at most one proposal.
--
-- The control plane's proposal-hold gate checks this before insert for a
-- friendly agent-facing error, but the database also needs to enforce it under
-- retries or concurrent tool calls. Ported from v0 migration 0004.
create unique index agent_proposals_one_per_source_message
  on public.agent_proposals(source_message_id);
