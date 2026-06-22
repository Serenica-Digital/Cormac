import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { buildMcpServer } from './server.js';

/**
 * HTTP mount for the runtime tool surface (ADR-025 open item 1: the tool
 * transport is an MCP server hosted by the control plane). Stateless streamable
 * HTTP: each POST builds a fresh server + transport, so no session state lives
 * here. Auth is a single workspace-scoped bearer token; the token IS the tenant
 * binding, so a runtime holding it can reach exactly one workspace's tools and
 * nothing else.
 */

function tokenMatches(header: string | undefined, expected: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const presented = Buffer.from(header.slice('Bearer '.length).trim());
  const wanted = Buffer.from(expected);
  return presented.length === wanted.length && timingSafeEqual(presented, wanted);
}

export function registerMcpRoutes(app: FastifyInstance): void {
  const { MCP_WORKSPACE_ID, MCP_WORKSPACE_TOKEN } = app.app.config;
  if (!MCP_WORKSPACE_ID || !MCP_WORKSPACE_TOKEN) {
    app.log.info('MCP tool surface disabled (MCP_WORKSPACE_ID / MCP_WORKSPACE_TOKEN not set)');
    return;
  }

  app.post('/mcp', async (request: FastifyRequest, reply) => {
    if (!tokenMatches(request.headers.authorization, MCP_WORKSPACE_TOKEN)) {
      return reply.status(401).send({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
    }

    const server = buildMcpServer(app.app, MCP_WORKSPACE_ID);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    // Hand the raw req/res to the MCP transport; Fastify must not touch it after this.
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // No SSE sessions in stateless mode: GET (server-push) and DELETE (session end)
  // have nothing to address.
  const methodNotAllowed = async (_req: FastifyRequest, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.code(405).send({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);
}
