import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import {
  agentCan,
  can,
  isRole,
  ProblemError,
  type AgentCapability,
  type Capability,
  type Role,
} from './shared.js';
import type { AgentContext, RequestContext } from './types.js';
import type { AgentTokenRow } from './rows.js';

/**
 * Verify the Supabase-issued JWT and attach the user id. This is the identity
 * gate; it proves who is calling but says nothing about what they may do in a
 * given workspace. That is the job of requireCapability below. Ported from v0.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ProblemError.unauthorized('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  const { jwks, hsSecret, config } = request.server.app;
  try {
    const { payload } = await jwtVerify(
      token,
      (protectedHeader, tok) => {
        if (protectedHeader.alg === 'HS256') {
          // hsSecret is null in prod-like environments: HS256 is refused so the
          // public dev secret cannot forge a token.
          if (!hsSecret) throw new Error('HS256 tokens are not accepted in this environment');
          return Promise.resolve(hsSecret);
        }
        return jwks(protectedHeader, tok);
      },
      {
        issuer: config.SUPABASE_AUTH_ISSUER ?? `${config.SUPABASE_URL}/auth/v1`,
        // Supabase user tokens always carry aud=authenticated.
        audience: 'authenticated',
      },
    );
    if (!payload.sub) throw new Error('token has no subject');
    request.authUserId = payload.sub;
  } catch {
    throw ProblemError.unauthorized('Invalid or expired token');
  }
}

interface MembershipRoleRow {
  role: Role;
}

/**
 * Load the caller's role in the workspace named by the route, then enforce that
 * the role holds the required capability before the handler runs. Authority is
 * checked here, server-side, where it cannot be bypassed by calling the API
 * directly. Ported from v0.
 */
export function requireCapability(capability: Capability) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.authUserId) throw ProblemError.unauthorized();

    const { workspaceId } = request.params as { workspaceId?: string };
    if (!workspaceId) throw ProblemError.badRequest('Missing workspaceId');

    const { db } = request.server.app;
    const { data, error } = await db
      .from('memberships')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', request.authUserId)
      .maybeSingle<MembershipRoleRow>();

    if (error) throw new Error(`membership lookup failed: ${error.message}`);
    if (!data || !isRole(data.role)) {
      // Not a member: do not leak existence. Read like any other forbidden call.
      throw ProblemError.forbidden('Not a member of this workspace');
    }

    if (!can(data.role, capability)) {
      throw ProblemError.forbidden(`Role "${data.role}" lacks capability "${capability}"`);
    }

    const ctx: RequestContext = { userId: request.authUserId, workspaceId, role: data.role };
    request.ctx = ctx;
  };
}

export function requireCtx(request: FastifyRequest): RequestContext {
  if (!request.ctx) throw ProblemError.unauthorized();
  return request.ctx;
}

/**
 * Gate the /api/operator/* surface: the caller must hold a platform_admins
 * row. This is Serenica's tier above workspace roles, and a separate surface:
 * the flag never bypasses requireCapability, and workspace guards never
 * consult it. Non-admins read as a plain 403, like any other forbidden call.
 */
export async function requirePlatformAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.authUserId) throw ProblemError.unauthorized();
  const { db } = request.server.app;
  const { data, error } = await db
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', request.authUserId)
    .maybeSingle();
  if (error) throw new Error(`platform admin lookup failed: ${error.message}`);
  if (!data) throw ProblemError.forbidden('Not permitted');
}

// --- Agent-token auth (ADR-0005) -------------------------------------------

export function hashAgentToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Authenticate a bundled-tool call on the /agent/* surface and enforce the
 * per-agent-kind capability split. The bearer token is hashed and looked up in
 * agent_tokens; the row binds (workspace, agent kind), so no workspaceId ever
 * travels in the path. The token conveys only the right to call these
 * endpoints: every write behind them stays schema-validated and service-role
 * executed. Authority, not transport, is the boundary (ADR-0001/0005).
 */
export function requireAgentCapability(capability: AgentCapability) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ProblemError.unauthorized('Missing agent token');
    }
    const raw = header.slice('Bearer '.length).trim();
    if (!raw) throw ProblemError.unauthorized('Missing agent token');

    const { db } = request.server.app;
    const { data, error } = await db
      .from('agent_tokens')
      .select('*')
      .eq('token_hash', hashAgentToken(raw))
      .maybeSingle<AgentTokenRow>();

    if (error) throw new Error(`agent token lookup failed: ${error.message}`);
    // Unknown and revoked tokens read identically: no existence leak.
    if (!data || data.revoked_at !== null) {
      throw ProblemError.unauthorized('Invalid agent token');
    }

    if (!agentCan(data.agent, capability)) {
      throw ProblemError.forbidden(`Agent "${data.agent}" lacks capability "${capability}"`);
    }

    const agentCtx: AgentContext = {
      workspaceId: data.workspace_id,
      agent: data.agent,
      tokenId: data.id,
    };
    request.agentCtx = agentCtx;
  };
}

export function requireAgentCtx(request: FastifyRequest): AgentContext {
  if (!request.agentCtx) throw ProblemError.unauthorized();
  return request.agentCtx;
}
