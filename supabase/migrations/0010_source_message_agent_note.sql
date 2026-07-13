-- The agent's conversational reply to a captured message, stored when the run
-- ends WITHOUT a proposal (when a proposal is held, the proposal itself is the
-- reply). This is what makes the Cormac conversation a server-side view over
-- the pipeline's own tables instead of a browser-local transcript: user turns
-- are source_messages, agent turns are this note or a proposal, decisions are
-- proposal status. Written only by the control plane during capture.

alter table public.source_messages add column agent_note text;
