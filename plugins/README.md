# Experimental Terra Source

This root exists so the current branch can be added directly to Juno as a
Terra community Source for the meeting spike. Canonical deployment remains
under `deploy/charts/`; entries here are adapters, not independent application
definitions.

Current plugin:

- `cormac-preview` — one namespaced application that vendors the portable
  control-plane, web, authoring-Hermes, and operations-Hermes charts.

Do not treat this directory as accepted production architecture without an
ADR-0003 follow-up based on the Juno spike evidence.
