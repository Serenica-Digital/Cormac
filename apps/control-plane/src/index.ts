import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { HermesClient } from './runtime/client.js';
import { HermesRuntime } from './runtime/hermes.js';
import type { RuntimeClient } from './runtime/types.js';

/**
 * Boot the control plane. Env comes from `infisical run` in development and
 * from the deployment later; there is no dotenv. Each Hermes lane is wired
 * when its URL (plus the shared HERMES_API_KEY) is configured; an unset lane
 * answers 503 on its feature and the rest of the surface works. The model id
 * sent on /v1/responses is the profile name by convention (ADR-0005); each
 * gateway serves exactly one profile, so it is fixed per lane.
 */
const config = loadConfig();

function lane(baseUrl: string | undefined, profile: string): RuntimeClient | null {
  if (!baseUrl || !config.HERMES_API_KEY) return null;
  const client = new HermesClient({
    baseUrl,
    apiKey: config.HERMES_API_KEY,
    timeoutMs: config.HERMES_TIMEOUT_MS,
  });
  return new HermesRuntime(client, profile);
}

const server = await buildServer(config, {
  authoring: lane(config.HERMES_AUTHORING_URL, 'cormac-authoring'),
  operations: lane(config.HERMES_OPS_URL, 'cormac-operations'),
});
await server.listen({ port: config.API_PORT, host: '0.0.0.0' });
