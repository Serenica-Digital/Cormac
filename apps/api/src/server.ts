import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ProblemError } from '@serenica/shared';
import { buildAppContext } from './app.js';
import type { Config } from './config.js';
import { registerMcpRoutes } from './mcp/routes.js';
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

  await fastify.register(cors, { origin: true });

  fastify.setErrorHandler((err, request, reply) => {
    if (err instanceof ProblemError) {
      void reply
        .status(err.status)
        .send({ error: err.code, message: err.message, detail: err.detail });
      return;
    }
    if (err instanceof ZodError) {
      void reply
        .status(400)
        .send({ error: 'bad_request', message: 'Invalid request', detail: err.issues });
      return;
    }
    request.log.error(err);
    void reply.status(500).send({ error: 'internal', message: 'Internal error' });
  });

  registerRoutes(fastify);
  registerMcpRoutes(fastify);
  return fastify;
}
