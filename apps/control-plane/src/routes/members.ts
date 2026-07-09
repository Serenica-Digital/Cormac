import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROLES, ProblemError, type Role } from '../shared.js';
import { authenticate, requireCapability, requireCtx } from '../auth.js';
import {
  countOwners,
  deleteMembership,
  findOrCreateAuthUserByEmail,
  getMembership,
  getUserEmail,
  insertAuditEvent,
  insertMembership,
  listMemberships,
  updateMembershipRole,
} from '../repo.js';

const addMemberBody = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(ROLES),
});
const changeRoleBody = z.object({ role: z.enum(ROLES) });

/**
 * Member management (manage_members: owner + agent_admin). Two invariants are
 * enforced here rather than in the database: the owner role only moves by an
 * owner's hand, and a workspace never drops to zero owners. The last-owner
 * check is check-then-write; at prototype scale the race is accepted, and a
 * single-statement RPC is the escape hatch if it ever matters.
 *
 * Workspace creation deliberately lives on the operator surface, not here:
 * there is no self-serve tenant story yet, so provisioning stays a Serenica
 * act.
 */
export function registerMemberRoutes(app: FastifyInstance): void {
  app.get(
    '/api/workspaces/:workspaceId/members',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { db } = request.server.app;
      const rows = await listMemberships(db, ctx.workspaceId);
      // One GoTrue lookup per member; N+1 is fine at prototype scale.
      const members = await Promise.all(
        rows.map(async (m) => ({
          userId: m.user_id,
          email: await getUserEmail(db, m.user_id),
          role: m.role,
          createdAt: m.created_at,
        })),
      );
      return { members };
    },
  );

  // Add by email, resolving or creating the auth user. Created users get no
  // password; they sign in via an OAuth provider or a magic link (PR-6).
  app.post(
    '/api/workspaces/:workspaceId/members',
    { preHandler: [authenticate, requireCapability('manage_members')] },
    async (request, reply) => {
      const ctx = requireCtx(request);
      const { db } = request.server.app;
      const { email, role } = addMemberBody.parse(request.body);

      if (role === 'owner' && ctx.role !== 'owner') {
        throw ProblemError.forbidden('Only an owner can grant the owner role');
      }

      const { userId, created } = await findOrCreateAuthUserByEmail(db, email);
      const existing = await getMembership(db, ctx.workspaceId, userId);
      if (existing) {
        throw new ProblemError(409, 'already_member', 'Already a member of this workspace');
      }

      const membership = await insertMembership(db, {
        workspaceId: ctx.workspaceId,
        userId,
        role,
      });
      await insertAuditEvent(db, {
        workspaceId: ctx.workspaceId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'member_added',
        objectApiName: null,
        recordId: null,
        before: null,
        after: { user_id: userId, email, role },
        sourceMessageId: null,
        proposalId: null,
      });

      void reply.status(201);
      return {
        member: { userId, email, role: membership.role, createdAt: membership.created_at },
        userCreated: created,
      };
    },
  );

  app.patch(
    '/api/workspaces/:workspaceId/members/:userId',
    { preHandler: [authenticate, requireCapability('manage_members')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { db } = request.server.app;
      const { userId } = request.params as { userId: string };
      const { role } = changeRoleBody.parse(request.body);

      if (userId === ctx.userId) {
        throw ProblemError.forbidden('You cannot change your own role');
      }
      const membership = await getMembership(db, ctx.workspaceId, userId);
      if (!membership) throw ProblemError.notFound('Not a member of this workspace');
      if ((role === 'owner' || membership.role === 'owner') && ctx.role !== 'owner') {
        throw ProblemError.forbidden('Only an owner can grant or remove the owner role');
      }
      if (
        membership.role === 'owner' &&
        role !== 'owner' &&
        (await countOwners(db, ctx.workspaceId)) <= 1
      ) {
        throw new ProblemError(409, 'last_owner', 'A workspace must keep at least one owner');
      }

      await updateMembershipRole(db, { workspaceId: ctx.workspaceId, userId, role: role as Role });
      await insertAuditEvent(db, {
        workspaceId: ctx.workspaceId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'member_role_changed',
        objectApiName: null,
        recordId: null,
        before: { user_id: userId, role: membership.role },
        after: { user_id: userId, role },
        sourceMessageId: null,
        proposalId: null,
      });

      return { member: { userId, role, createdAt: membership.created_at } };
    },
  );

  // Self-removal is allowed (unlike self role change); the last-owner check
  // still stops the only owner from abandoning the workspace.
  app.delete(
    '/api/workspaces/:workspaceId/members/:userId',
    { preHandler: [authenticate, requireCapability('manage_members')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { db } = request.server.app;
      const { userId } = request.params as { userId: string };

      const membership = await getMembership(db, ctx.workspaceId, userId);
      if (!membership) throw ProblemError.notFound('Not a member of this workspace');
      if (membership.role === 'owner' && ctx.role !== 'owner') {
        throw ProblemError.forbidden('Only an owner can remove an owner');
      }
      if (membership.role === 'owner' && (await countOwners(db, ctx.workspaceId)) <= 1) {
        throw new ProblemError(409, 'last_owner', 'A workspace must keep at least one owner');
      }

      await deleteMembership(db, ctx.workspaceId, userId);
      await insertAuditEvent(db, {
        workspaceId: ctx.workspaceId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'member_removed',
        objectApiName: null,
        recordId: null,
        before: { user_id: userId, role: membership.role },
        after: null,
        sourceMessageId: null,
        proposalId: null,
      });

      return { removed: true };
    },
  );
}
