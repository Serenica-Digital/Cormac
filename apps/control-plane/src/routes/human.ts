import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseContract, type Contract } from '@cormac/contract';
import { ProblemError } from '../shared.js';
import { authenticate, requireCapability, requireCtx } from '../auth.js';
import { captureUpdate } from '../pipeline/capture.js';
import { decideProposal } from '../pipeline/apply.js';
import { publishContract } from '../pipeline/contract.js';
import { proposalsView } from '../pipeline/queries.js';
import type { ProposalStatus } from '../rows.js';
import {
  getActiveContract,
  insertWorkbookSnapshot,
  listAuditEvents,
  listRecords,
} from '../repo.js';

const captureBody = z.object({ text: z.string().min(1).max(4000) });
const decisionBody = z.object({ decision: z.enum(['approve', 'reject']) });
const publishBody = z.object({ contract: z.unknown() });
const workbookBody = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'workbook name must be a lowercase slug'),
  profile: z.record(z.unknown()),
});
const proposalStatuses: ProposalStatus[] = ['pending', 'applied', 'rejected'];

/**
 * The human surface (ported from v0's routes.ts minus the learning routes,
 * which are deferred with #35; plus the v2 workbook-snapshot upload). Every
 * handler runs behind authenticate + a capability guard.
 */
export function registerHumanRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ status: 'ok' }));
  // Root alias for platform probes.
  app.get('/health', async () => ({ status: 'ok' }));

  // Capture: natural language in -> source message + held proposal out.
  app.post(
    '/api/workspaces/:workspaceId/capture',
    { preHandler: [authenticate, requireCapability('capture_update')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { text } = captureBody.parse(request.body);
      return captureUpdate(request.server.app, ctx, text);
    },
  );

  // The review queue.
  app.get(
    '/api/workspaces/:workspaceId/proposals',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { status } = request.query as { status?: string };
      const filter =
        status && (proposalStatuses as string[]).includes(status)
          ? (status as ProposalStatus)
          : undefined;
      const proposals = await proposalsView(request.server.app, ctx.workspaceId, filter);
      return { proposals };
    },
  );

  // Approve or reject: the only path that writes a business record.
  app.post(
    '/api/workspaces/:workspaceId/proposals/:proposalId/decision',
    { preHandler: [authenticate, requireCapability('approve_proposal')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { proposalId } = request.params as { proposalId: string };
      const { decision } = decisionBody.parse(request.body);
      return decideProposal(request.server.app, ctx, proposalId, decision);
    },
  );

  app.get(
    '/api/workspaces/:workspaceId/records',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { object } = request.query as { object?: string };
      const records = await listRecords(request.server.app.db, ctx.workspaceId, object);
      return { records };
    },
  );

  app.get(
    '/api/workspaces/:workspaceId/audit',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const events = await listAuditEvents(request.server.app.db, ctx.workspaceId);
      return { events };
    },
  );

  app.get(
    '/api/workspaces/:workspaceId/contract',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const row = await getActiveContract(request.server.app.db, ctx.workspaceId);
      if (!row) throw ProblemError.notFound('No active contract for this workspace');
      return { contract: row.document, version: row.version };
    },
  );

  // Publish a new contract version (schema + glossary): the one contract gate.
  // The version in the body is advisory; the server assigns the authoritative one.
  app.post(
    '/api/workspaces/:workspaceId/contract/publish',
    { preHandler: [authenticate, requireCapability('publish_contract')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { contract } = publishBody.parse(request.body);
      let parsed: Contract;
      try {
        parsed = parseContract(contract);
      } catch (err) {
        throw new ProblemError(
          422,
          'contract_invalid',
          'The contract did not validate and was not published',
          err instanceof Error ? err.message : String(err),
        );
      }
      return publishContract(
        request.server.app,
        { workspaceId: ctx.workspaceId, actorId: ctx.userId },
        parsed,
      );
    },
  );

  // Upload a workbook detection profile (v2). This is what the Excel pane will
  // eventually push; until then it is how a workspace gets seeded for the
  // authoring interview. Gated like the contract itself: publish_contract.
  app.post(
    '/api/workspaces/:workspaceId/workbook',
    { preHandler: [authenticate, requireCapability('publish_contract')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { name, profile } = workbookBody.parse(request.body);
      const row = await insertWorkbookSnapshot(request.server.app.db, {
        workspaceId: ctx.workspaceId,
        name,
        profile,
        createdBy: ctx.userId,
      });
      return { snapshotId: row.id, name: row.name, createdAt: row.created_at };
    },
  );
}
