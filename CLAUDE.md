@AGENTS.md

## Claude Code specifics

### Vocabulary (use these exactly)

- **Serenica Digital**: the LLC, the legal entity. Formal artifacts say Serenica Digital.
- **Cormac**: the product, whole — platform, control plane, client-facing agent, SMS
  persona. "Cormac, by Serenica Digital" is the commercial framing.
- **the control plane**: our Node/TypeScript backend trust layer — the only thing that
  writes business records.
- **Hermes / the agent runtime**: NousResearch Hermes Agent, the product's execution
  runtime, driven via its API server. Never call the control plane Hermes.
- **Jarvis**: a Hermes instance used as development PM tooling (profile `jarvis-cormac`
  for this repo). Never a product component; never touches client data.
- **Juno**: external compute-orchestration platform, dev substrate only, swappable.
- **the contract**: a client's published, versioned semantic contract.
- **surfaces**: Excel pane, web, SMS, email, Claude/MCP — doors, never writers.

### Branching and commits

- `dev` is the work trunk. Commit docs, config, and routine code straight to `dev`;
  don't stop to ask before an ordinary commit. `main` updates by PR at milestones.
- Behavior-changing or risky code takes a short-lived branch off `dev` and a PR back.
- Keep commits scoped; never sweep unrelated working-tree changes into a commit.
- No AI attribution trailers in commits, ever.

### Working style

Write tight and declarative. No em-dashes. Avoid the "not X, but Y" reversal. State what
is true and what is open; flag overstatements rather than smoothing them. Honesty over
polish. Mark mechanics claims verified (with evidence) or assumed.
