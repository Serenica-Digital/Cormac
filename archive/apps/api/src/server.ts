import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ProblemError } from '@cormac/shared';
import { buildAppContext } from './app.js';
import type { Config } from './config.js';
import { registerMcpRoutes } from './mcp/routes.js';
import { registerCaptureStreamRoute } from './routes/capture-stream.js';
import { registerRoutes } from './routes.js';
import './types.js';

/**
 * Build the control-plane HTTP server: decorate the app context (which holds the
 * service-role client), wire CORS, install a single problem-shaped error
 * handler, and register routes.
 */
export async function buildServer(config: Config): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: true });

  fastify.decorate('app', buildAppContext(config));

  // Allowlist, not origin: true. Origins off the list get no CORS headers (#3).
  const corsOrigins = config.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  await fastify.register(cors, { origin: corsOrigins });

  fastify.setErrorHandler((err, request, reply) => {
    if (err instanceof ProblemError) {
      // 4xx detail is authored for the caller and passes through. 5xx detail is
      // upstream text (Supabase, the runtime); it is logged here and never sent
      // to the client (#6).
      if (err.status >= 500) {
        request.log.error({ code: err.code, detail: err.detail }, err.message);
        void reply.status(err.status).send({ error: err.code, message: err.message });
        return;
      }
      void reply
        .status(err.status)
        .send({ error: err.code, message: err.message, detail: err.detail });
      return;
    }
    if (err instanceof ZodError) {
      // Compact field feedback, not the raw issue dump (#6).
      const detail = err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      void reply.status(400).send({ error: 'bad_request', message: 'Invalid request', detail });
      return;
    }
    request.log.error(err);
    void reply.status(500).send({ error: 'internal', message: 'Internal error' });
  });

  registerRoutes(fastify);
  registerMcpRoutes(fastify);
  registerCaptureStreamRoute(fastify);
  return fastify;
}
