import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import { can, isRole, ProblemError, type Capability, type Role } from '@cormac/shared';
import { TABLES } from '@cormac/db';
import type { RequestContext } from './types.js';

/**
 * Verify the Supabase-issued JWT and attach the user id. This is the identity
 * gate (ADR-011); it proves who is calling but says nothing about what they may
 * do in a given workspace. That is the job of requireCapability below.
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
      (protectedHeader, tok) =>
        protectedHeader.alg === 'HS256' ? Promise.resolve(hsSecret) : jwks(protectedHeader, tok),
      {
        issuer: config.SUPABASE_AUTH_ISSUER ?? `${config.SUPABASE_URL}/auth/v1`,
        // Supabase user tokens always carry aud=authenticated (ADR-020, #4).
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
 * the role holds the required capability before the handler runs (ADR-011,
 * ADR-015). Authority is checked here, server-side, where it cannot be bypassed
 * by calling the API directly.
 */
export function requireCapability(capability: Capability) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.authUserId) throw ProblemError.unauthorized();

    const { workspaceId } = request.params as { workspaceId?: string };
    if (!workspaceId) throw ProblemError.badRequest('Missing workspaceId');

    const { db } = request.server.app;
    const { data, error } = await db
      .from(TABLES.memberships)
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
