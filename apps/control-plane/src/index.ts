import { hermesUrlFor, loadConfig } from './config.js';
import { buildServer } from './server.js';
import { HermesClient } from './runtime/client.js';
import { HermesRuntime } from './runtime/hermes.js';
import type { RuntimeClient } from './runtime/types.js';

/**
 * Boot the control plane. Env comes from `infisical run` in development and
 * from the deployment later; there is no dotenv. The Hermes runtime is wired
 * when HERMES_API_KEY plus at least one gateway URL are configured (per-kind
 * HERMES_AUTHORING_URL / HERMES_OPS_URL, falling back to HERMES_URL); until
 * then capture and authoring turns answer 503 and the rest of the surface
 * works. A kind whose URL is missing simply keeps 503 for its lane.
 */
const config = loadConfig();

let runtime: RuntimeClient | null = null;
const authoringUrl = hermesUrlFor(config, 'authoring');
const opsUrl = hermesUrlFor(config, 'operations');
if ((authoringUrl || opsUrl) && config.HERMES_API_KEY) {
  const clientFor = (baseUrl: string) =>
    new HermesClient({
      baseUrl,
      apiKey: config.HERMES_API_KEY!,
      timeoutMs: config.HERMES_TIMEOUT_MS,
    });
  // A missing lane points at the other lane's URL: the request still fails
  // fast at the gateway (unknown model/profile) rather than crashing boot.
  const authoringClient = clientFor(authoringUrl ?? opsUrl!);
  const opsClient = clientFor(opsUrl ?? authoringUrl!);
  runtime = new HermesRuntime(authoringClient, opsClient, config.HERMES_MODEL);
}

const server = await buildServer(config, runtime);
await server.listen({ port: config.API_PORT, host: '0.0.0.0' });
