# Local headless Hermes (integration spike kit)

> **Status:** draft · **Last reviewed:** 2026-06-10

Runs the Hermes product runtime locally in its headless posture (ADR-025): API server only, messaging gateways off, persistent memory off. This is step one of the real-Hermes integration spike (ADR-021 open item 1). Configuration values come from the 2026-06-10 deployment research ([docs/research/juno-hermes-deployment-research.md](../../docs/research/juno-hermes-deployment-research.md)); each is marked verify-on-first-run because the runtime moves fast.

## Run

```sh
cp .env.example .env        # fill ANTHROPIC_API_KEY and pick an API_SERVER_KEY
docker compose up
```

Then verify, in order:

1. **Health:** `curl -s http://localhost:8642/health` returns 200 without auth.
2. **Auth:** `curl -s -H "Authorization: Bearer $API_SERVER_KEY" http://localhost:8642/v1/capabilities` returns 200; without the header it returns 401.
3. **Zero-adapter gateway (open research flag):** the gateway process runs cleanly with no messaging platform tokens configured. Watch the logs for adapter errors.
4. **Cron quiet (open research flag):** with no cron jobs defined, the 60s gateway tick stays silent.
5. **Memory off:** confirm the config keys below are honored (no memory writes under the data volume after a test run).

## Posture (what is deliberately off and why)

- Messaging gateways off: connector ingress belongs to the control plane (ADR-005, ADR-007). Gateways activate only when a platform token is present, so the `.env` simply contains none.
- Persistent memory off: learning lives as governed contract data (ADR-009). See `config.yaml`.
- Stateless per task: each `/v1/runs` is a fresh session; multi-turn state is the control plane's job (ADR-025).

## Pinning

Pin the image tag in `compose.yaml` to the current release before relying on results (v0.16.0 at the time of writing; check the releases page). The P1 memory leak (#25315) was unpatched at last review, so long-running local gateways should be restarted periodically; irrelevant for short spike runs.
