# AGENTS.md

Portable entrypoint for agents working in this repo. This is the canonical door file: Codex
reads it natively, Hermes loads it as project context (first match in
`.hermes.md → AGENTS.md → CLAUDE.md → .cursorrules`), and Claude Code reads it through the
`@AGENTS.md` import in `CLAUDE.md`.

## This project

**Cormac, by Serenica Digital** — a contract-first CRM agent platform, being rebuilt from a
clean slate (v0 lives untouched under `archive/`; treat it as reference, never as current
truth). The rebuild's keystone is the authoring agent; see `.jarvis/adr/0002`.

This repo is PM-managed by a Jarvis instance: profile `jarvis-cormac`, API hub on port
**8643** (manual start: `skills/consult/scripts/hub.sh run --profile jarvis-cormac` in the
Jarvis repo). Consults go to conversation `consult:CRM-Agent`.

## Project knowledge

- **Current truth:** `.jarvis/prd/` — `executive-summary.md`, `requirements.md`,
  `architecture.md`.
- **Settled decisions:** `.jarvis/adr/` — numbered, never-deleted ADRs. Don't relitigate
  an accepted ADR without new evidence. (v0's ADRs are under `archive/docs/adr/` —
  historical record only.)
- **Reusable topic knowledge:** `.jarvis/research/` — includes the v0 retrospective and the
  Jarvis project digest; read them before proposing architecture.

## Working rules

- Durable knowledge belongs in tracked `.jarvis/` (and the GitHub tracker:
  Serenica-Digital/Cormac, Project #3), not in chat or notes.
- `.jarvis/tmp/**` is gitignored runtime scratch: transcripts, spines, draft plans, notes.
  Don't treat it as truth.
- Never read raw transcript JSONL directly into context; evidence is projected/digested
  first (see the `transcript-digest` skill).
- A PM agent (Jarvis) reviews session transcripts and updates `.jarvis/` + GitHub. When
  you finish a scoped task, leave enough in the repo/handoff for that review to work.
- Keep scopes small and boundaries clear; prefer human review before merging.

Jarvis's PM identity and procedures live in its Hermes profile (SOUL + skills), not here.
