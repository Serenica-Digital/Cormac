import 'fastify';
import type { Role } from '@cormac/shared';
import type { AppContext } from './app.js';

/** The authenticated, workspace-scoped context every protected handler runs in. */
export interface RequestContext {
  userId: string;
  workspaceId: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUserId?: string;
    ctx?: RequestContext;
  }
  interface FastifyInstance {
    app: AppContext;
  }
}
