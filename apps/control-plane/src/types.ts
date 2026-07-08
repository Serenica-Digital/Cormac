import 'fastify';
import type { AgentKind, Role } from './shared.js';
import type { AppContext } from './app.js';

/** The authenticated, workspace-scoped context every protected human handler runs in. */
export interface RequestContext {
  userId: string;
  workspaceId: string;
  role: Role;
}

/**
 * The token-scoped context every /agent/* handler runs in (ADR-0005). The
 * token IS the tenant binding: no workspaceId travels in the path.
 */
export interface AgentContext {
  workspaceId: string;
  agent: AgentKind;
  tokenId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUserId?: string;
    ctx?: RequestContext;
    agentCtx?: AgentContext;
  }
  interface FastifyInstance {
    app: AppContext;
  }
}
