import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProblemError } from '../shared.js';
import { authenticate, requirePlatformAdmin } from '../auth.js';
import {
  findOrCreateAuthUserByEmail,
  getActiveContract,
  getAgentTokenSafe,
  getUserEmail,
  getWorkspace,
  getWorkspaceStats,
  insertAuditEvent,
  insertMembership,
  insertWorkspace,
  listAgentTokensSafe,
  listAllWorkspaces,
  listMemberships,
  revokeAgentToken,
  type AgentTokenSafe,
} from '../repo.js';

const createWorkspaceBody = z.object({
  name: z.string().trim().min(1).max(200),
  ownerEmail: z.string().trim().toLowerCase().email().max(320).optional(),
});

function tokenView(token: AgentTokenSafe) {
  return {
    id: token.id,
    workspaceId: token.workspace_id,
    agent: token.agent,
    createdAt: token.created_at,
    revokedAt: token.revoked_at,
  };
}

/**
 * The platform-operator surface (Serenica-internal): tenant provisioning and
 * oversight. Everything here runs behind requirePlatformAdmin, and none of it
 * consults or bypasses workspace capability guards; an operator who is not a
 * member of a workspace still cannot touch its records through /api/workspaces.
 * Agent-token responses are built from reads that never select token_hash.
 */
export function registerOperatorRoutes(app: FastifyInstance): void {
  app.get(
    '/api/operator/workspaces',
    { preHandler: [authenticate, requirePlatformAdmin] },
    async (request) => {
      const { db } = request.server.app;
      const rows = await listAllWorkspaces(db);
      const workspaces = await Promise.all(
        rows.map(async (ws) => ({
          id: ws.id,
          name: ws.name,
          createdAt: ws.created_at,
          stats: await getWorkspaceStats(db, ws.id),
        })),
      );
      return { workspaces };
    },
  );

  app.get(
    '/api/operator/workspaces/:workspaceId',
    { preHandler: [authenticate, requirePlatformAdmin] },
    async (request) => {
      const { db } = request.server.app;
      const { workspaceId } = request.params as { workspaceId: string };
      const ws = await getWorkspace(db, workspaceId);
      if (!ws) throw ProblemError.notFound('No such workspace');

      const [stats, memberships, tokens, contractRow] = await Promise.all([
        getWorkspaceStats(db, workspaceId),
        listMemberships(db, workspaceId),
        listAgentTokensSafe(db, workspaceId),
        getActiveContract(db, workspaceId),
      ]);
      const members = await Promise.all(
        memberships.map(async (m) => ({
          userId: m.user_id,
          email: await getUserEmail(db, m.user_id),
          role: m.role,
          createdAt: m.created_at,
        })),
      );

      return {
        workspace: {
          id: ws.id,
          name: ws.name,
          confirmationMode: ws.confirmation_mode,
          createdAt: ws.created_at,
        },
        stats,
        members,
        agentTokens: tokens.map(tokenView),
        contract: contractRow ? { version: contractRow.version, document: contractRow.document } : null,
      };
    },
  );

  // Provisioning is a Serenica act: there is no self-serve tenant story yet,
  // so workspace creation lives here rather than on the member surface.
  app.post(
    '/api/operator/workspaces',
    { preHandler: [authenticate, requirePlatformAdmin] },
    async (request, reply) => {
      const { db } = request.server.app;
      const { name, ownerEmail } = createWorkspaceBody.parse(request.body);

      const ws = await insertWorkspace(db, name);
      await insertAuditEvent(db, {
        workspaceId: ws.id,
        actorType: 'user',
        actorId: request.authUserId ?? null,
        action: 'workspace_created',
        objectApiName: null,
        recordId: null,
        before: null,
        after: { name: ws.name },
        sourceMessageId: null,
        proposalId: null,
      });

      let owner: { userId: string; email: string; userCreated: boolean } | null = null;
      if (ownerEmail) {
        const { userId, created } = await findOrCreateAuthUserByEmail(db, ownerEmail);
        await insertMembership(db, { workspaceId: ws.id, userId, role: 'owner' });
        await insertAuditEvent(db, {
          workspaceId: ws.id,
          actorType: 'user',
          actorId: request.authUserId ?? null,
          action: 'member_added',
          objectApiName: null,
          recordId: null,
          before: null,
          after: { user_id: userId, email: ownerEmail, role: 'owner' },
          sourceMessageId: null,
          proposalId: null,
        });
        owner = { userId, email: ownerEmail, userCreated: created };
      }

      void reply.status(201);
      return {
        workspace: { id: ws.id, name: ws.name, createdAt: ws.created_at },
        owner,
      };
    },
  );

  // Idempotent: revoking an already-revoked token answers the same shape with
  // the original revocation time, so operators can retry without thinking.
  app.post(
    '/api/operator/agent-tokens/:tokenId/revoke',
    { preHandler: [authenticate, requirePlatformAdmin] },
    async (request) => {
      const { db } = request.server.app;
      const { tokenId } = request.params as { tokenId: string };
      const token = await getAgentTokenSafe(db, tokenId);
      if (!token) throw ProblemError.notFound('No such agent token');
      if (token.revoked_at) return { token: tokenView(token) };

      await revokeAgentToken(db, tokenId);
      await insertAuditEvent(db, {
        workspaceId: token.workspace_id,
        actorType: 'user',
        actorId: request.authUserId ?? null,
        action: 'agent_token_revoked',
        objectApiName: null,
        recordId: null,
        before: null,
        after: { token_id: token.id, agent: token.agent },
        sourceMessageId: null,
        proposalId: null,
      });

      const revoked = await getAgentTokenSafe(db, tokenId);
      return { token: tokenView(revoked!) };
    },
  );
}
