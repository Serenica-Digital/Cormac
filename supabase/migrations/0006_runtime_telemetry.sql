-- Per-run usage telemetry lands on the source message (issue #39).
--
-- The adapter captures the run's usage object (tokens, cost) from the Runs
-- API; until now it was dropped, and the runtime's own copy dies with the
-- session the adapter deletes after every run (ADR-026). One run per source
-- message today, so the message row is the natural home. Billing modes
-- (ADR-013) and ops cost tracking read from here.

alter table public.source_messages
  add column runtime_run_id text,
  add column runtime_usage jsonb;
