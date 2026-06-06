import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

// Load the repo-root .env when running locally. In containers the environment
// is injected, so a missing file is fine.
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const config = loadConfig();
const server = await buildServer(config);

try {
  await server.listen({ host: '0.0.0.0', port: config.API_PORT });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
