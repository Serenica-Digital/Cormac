import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProblemError } from '@serenica/shared';
import { parseContract, type Contract } from '@serenica/contract';
import type { LearnedStatus, ProposalStatus } from '@serenica/db';
import { authenticate, requireCapability, requireCtx } from './auth.js';
import { captureUpdate } from './pipeline/capture.js';
import { decideProposal } from './pipeline/apply.js';
import { decideLearning, revokeLearning } from './pipeline/learning.js';
import { publishContract } from './pipeline/contract.js';
import { proposalsView } from './pipeline/queries.js';
import { getActiveContract, listAuditEvents, listLearnedKnowledge, listRecords } from './repo.js';

const captureBody = z.object({ text: z.string().min(1).max(4000) });
const decisionBody = z.object({ decision: z.enum(['approve', 'reject']) });
const publishBody = z.object({ contract: z.unknown() });
const proposalStatuses: ProposalStatus[] = ['pending', 'applied', 'rejected'];
const learnedStatuses: LearnedStatus[] = ['proposed', 'active', 'revoked'];

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

  // Publish a new contract version (schema + glossary): the one contract gate
  // (ADR-002, ADR-027). The version in the body is advisory; the server assigns
  // the authoritative one.
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
      return publishContract(request.server.app, ctx, parsed);
    },
  );

  // The learned-knowledge queue (ADR-027 stratum 3).
  app.get(
    '/api/workspaces/:workspaceId/learning',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { status } = request.query as { status?: string };
      const filter =
        status && (learnedStatuses as string[]).includes(status)
          ? (status as LearnedStatus)
          : undefined;
      const learned = await listLearnedKnowledge(request.server.app.db, ctx.workspaceId, filter);
      return { learned };
    },
  );

  // Approve or reject a proposed learned item: the human gate (ADR-027 section
  // 4), the same trust level as approving a proposal.
  app.post(
    '/api/workspaces/:workspaceId/learning/:learnedId/decision',
    { preHandler: [authenticate, requireCapability('approve_proposal')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { learnedId } = request.params as { learnedId: string };
      const { decision } = decisionBody.parse(request.body);
      return decideLearning(request.server.app, ctx, learnedId, decision);
    },
  );

  // Revoke an already-active learned item.
  app.post(
    '/api/workspaces/:workspaceId/learning/:learnedId/revoke',
    { preHandler: [authenticate, requireCapability('approve_proposal')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { learnedId } = request.params as { learnedId: string };
      return revokeLearning(request.server.app, ctx, learnedId);
    },
  );
}
