import { loadConfig } from './config.js';
import { buildServer } from './server.js';

// Env is injected: by the container (ConfigMap + ESO) in k3d/Juno, and by
// `infisical run` for bare-host dev (ADR-035). Nothing reads a .env file.
const config = loadConfig();
const server = await buildServer(config);

try {
  await server.listen({ host: '0.0.0.0', port: config.API_PORT });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
