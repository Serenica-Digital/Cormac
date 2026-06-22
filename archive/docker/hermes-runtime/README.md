# Hermes product-runtime profile

> **Status:** active · **Last reviewed:** 2026-06-13

The versioned configuration of the Hermes product runtime (ADR-006, ADR-025): the CRM Operations Agent in its headless, contained posture. The runtime image bakes these files into the pinned image (`docker/Dockerfile.hermes`); local k3d and Juno both run that same image (ADR-035). Secrets never live here; `${VAR}` values are env-interpolated by Hermes at load (verified against the configuration docs, 2026-06-10).

## Files

- `config.yaml`: memory and user profile off (ADR-009); the control-plane MCP server with the operations-agent tool allowlist (ADR-025); the `pre_tool_call` deny hook.
- `SOUL.md`: the operations agent's identity and working rules. One task per session, tools are the only data access, at most one proposal, uncertainty is flagged rather than hidden.
- `agent-hooks/deny-terminal.sh`: the second gate. Vetoes every `terminal` tool call independent of what the model decided.

## Posture (what is deliberately off and why)

- **Messaging gateways off:** connector ingress belongs to the control plane (ADR-005, ADR-007). Gateways activate only when a platform token is present, so the runtime env simply contains none.
- **Persistent memory off:** learning lives as governed contract data (ADR-009).
- **Stateless per task:** each `/v1/runs` is a fresh session; multi-turn state is the control plane's job (ADR-025).
- **No database credentials:** the runtime's only reach into CRM data is the MCP tool surface at `http://cormac-api:8088/mcp`, bound to one workspace by `MCP_WORKSPACE_TOKEN`. Every tool executes inside the control plane, so the write gate is intrinsic.

## Env the runtime expects (injected by the chart: ConfigMap + the ESO-synced secret)

| Var | Purpose |
| --- | --- |
| `RUNTIME_API_KEY` | Becomes `API_SERVER_KEY`: bearer auth on the Runs API |
| `ANTHROPIC_API_KEY` | Model provider (ADR-013) |
| `MCP_WORKSPACE_TOKEN` | Interpolated into `config.yaml`; the workspace binding |

`MCP_SERVER_URL` is set by the chart to the cluster Service DNS (`http://cormac-api:8088/mcp`), the same in local k3d and on Juno.

## Verify on first run (spike checklist)

1. **Health:** `curl -s http://localhost:8642/health` returns 200 without auth.
2. **Auth:** `/v1/runs` without the bearer key returns 401; with it, 202.
3. **Gateways quiet:** logs show no messaging adapter activity with no platform tokens set.
4. **Memory off:** no memory writes under the data volume after a test run.
5. **Tools wired:** a test run lists exactly the four allowlisted tools.
6. **Deny gate:** a run instructed to use the terminal gets the hook's block reason instead.

## Pinning

The image is pinned in `docker/Dockerfile.hermes` and the chart values (`v2026.6.5` at last review); never `:latest`. The P1 upstream memory leak (#25315) was unpatched at last review, so long-running deployments recycle workers on a schedule; irrelevant for short local runs.
