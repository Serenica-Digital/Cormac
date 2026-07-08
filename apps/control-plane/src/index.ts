import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { HermesClient } from './runtime/client.js';
import { HermesRuntime } from './runtime/hermes.js';
import type { RuntimeClient } from './runtime/types.js';

/**
 * Boot the control plane. Env comes from `infisical run` in development and
 * from the deployment later; there is no dotenv. The Hermes runtime client is
 * wired when HERMES_URL + HERMES_API_KEY are configured; until then capture
 * and authoring turns answer 503 and the rest of the surface works.
 */
const config = loadConfig();

let runtime: RuntimeClient | null = null;
if (config.HERMES_URL && config.HERMES_API_KEY) {
  const client = new HermesClient({
    baseUrl: config.HERMES_URL,
    apiKey: config.HERMES_API_KEY,
    timeoutMs: config.HERMES_TIMEOUT_MS,
  });
  runtime = new HermesRuntime(client, config.HERMES_MODEL);
}

const server = await buildServer(config, runtime);
await server.listen({ port: config.API_PORT, host: '0.0.0.0' });
