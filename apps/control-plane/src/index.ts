import { loadConfig } from './config.js';
import { buildServer } from './server.js';

/**
 * Boot the control plane. Env comes from `infisical run` in development and
 * from the deployment later; there is no dotenv. The Hermes runtime client is
 * wired in when configured (phase 5); until then capture answers 503 and the
 * rest of the surface works.
 */
const config = loadConfig();
const server = await buildServer(config);
await server.listen({ port: config.API_PORT, host: '0.0.0.0' });
