import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProblemError } from '@serenica/shared';
import type { ProposalStatus } from '@serenica/db';
import { authenticate, requireCapability, requireCtx } from './auth.js';
import { captureUpdate } from './pipeline/capture.js';
import { decideProposal } from './pipeline/apply.js';
import { proposalsView } from './pipeline/queries.js';
import { getActiveContract, listAuditEvents, listRecords } from './repo.js';

const captureBody = z.object({ text: z.string().min(1).max(4000) });
const decisionBody = z.object({ decision: z.enum(['approve', 'reject']) });
const proposalStatuses: ProposalStatus[] = ['pending', 'applied', 'rejected'];

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ status: 'ok' }));
  // Root alias for platform probes (compose healthchecks, Juno ingress).
  app.get('/health', async () => ({ status: 'ok' }));

  // Capture: natural language in -> source message + held proposal out (ADR-007, ADR-010).
  app.post(
    '/api/workspaces/:workspaceId/capture',
    { preHandler: [authenticate, requireCapability('capture_update')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { text } = captureBody.parse(request.body);
      return captureUpdate(request.server.app, ctx, text);
    },
  );

  // The review queue (ADR-010).
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

  // Approve or reject: the only path that writes a business record (ADR-005).
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
}
