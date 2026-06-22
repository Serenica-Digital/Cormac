-- One runtime task may hold at most one proposal.
--
-- submit_proposal checks this before insert for a friendly MCP tool error, but
-- the database also needs to enforce it under retries or concurrent tool calls.
create unique index agent_proposals_one_per_source_message
  on public.agent_proposals(source_message_id);
