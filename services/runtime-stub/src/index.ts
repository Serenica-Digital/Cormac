import Fastify from 'fastify';
import { propose, type ProposeRequest } from './propose.js';

const port = Number(process.env.RUNTIME_PORT ?? 8090);
const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok', runtime: 'stub' }));

app.post('/propose', async (request) => {
  return propose(request.body as ProposeRequest);
});

try {
  await app.listen({ host: '0.0.0.0', port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
