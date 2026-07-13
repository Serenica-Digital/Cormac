import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseContract, proposedChangeSchema, type Contract } from '@cormac/contract';
import { ProblemError } from '../shared.js';
import { authenticate, requireCapability, requireCtx } from '../auth.js';
import { captureUpdate } from '../pipeline/capture.js';
import { decideProposal } from '../pipeline/apply.js';
import { commitHumanChanges } from '../pipeline/commit.js';
import { publishContract } from '../pipeline/contract.js';
import { conversationView, proposalsView, recordTimeline } from '../pipeline/queries.js';
import type { ProposalStatus } from '../rows.js';
import {
  getActiveContract,
  getRecord,
  getUserEmail,
  insertWorkbookSnapshot,
  isPlatformAdmin,
  listAuditEvents,
  listRecords,
  listWorkspacesForUser,
} from '../repo.js';

const captureBody = z.object({ text: z.string().min(1).max(4000) });
const decisionBody = z
  .object({
    decision: z.enum(['approve', 'reject']),
    /** Change indexes to apply; the rest are dropped. Omit to approve all. */
    keep: z.array(z.number().int().min(0)).min(1).max(500).optional(),
  })
  .refine((b) => !(b.decision === 'reject' && b.keep), {
    message: 'keep only applies to approve; a reject drops every change',
  });
const commitBody = z.object({
  changes: z.array(proposedChangeSchema).min(1).max(500),
  channel: z.enum(['web', 'excel']).default('web'),
  note: z.string().max(2000).optional(),
});
const publishBody = z.object({ contract: z.unknown() });
const authoringTurnBody = z.object({ text: z.string().min(1).max(8000) });
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

  // The conversation: a read view over source messages, stored agent replies,
  // and (via the proposals query) what Cormac proposed. Nothing here writes.
  app.get(
    '/api/workspaces/:workspaceId/conversation',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const messages = await conversationView(request.server.app, ctx.workspaceId);
      return { messages };
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

  // Approve or reject: applies (or discards) an agent-held proposal.
  app.post(
    '/api/workspaces/:workspaceId/proposals/:proposalId/decision',
    { preHandler: [authenticate, requireCapability('approve_proposal')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { proposalId } = request.params as { proposalId: string };
      const { decision, keep } = decisionBody.parse(request.body);
      return decideProposal(request.server.app, ctx, proposalId, decision, keep);
    },
  );

  // Direct human edits and workbook import (ADR-0014). A batch of structured
  // changes the user authored is validated for human-editability and applied in
  // one request; the user's Save/import IS the confirmation, so this auto-applies
  // rather than queueing for the Inbox. Gated on `edit_records`, which rides the
  // approve set — a member who cannot approve cannot self-apply here either.
  app.post(
    '/api/workspaces/:workspaceId/records/commit',
    { preHandler: [authenticate, requireCapability('edit_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { changes, channel, note } = commitBody.parse(request.body);
      return commitHumanChanges(request.server.app, ctx, { changes, channel, note });
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

  // One record plus its history: audit events joined with the utterance and
  // proposal that produced each change. The record-detail read for surfaces.
  app.get(
    '/api/workspaces/:workspaceId/records/:recordId/timeline',
    { preHandler: [authenticate, requireCapability('read_records')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { recordId } = request.params as { recordId: string };
      const record = await getRecord(request.server.app.db, ctx.workspaceId, recordId);
      if (!record) throw ProblemError.notFound('No such record in this workspace');
      const entries = await recordTimeline(request.server.app, ctx.workspaceId, recordId);
      return { record, entries };
    },
  );

  // Who is calling: identity plus the platform-operator flag. Email comes from
  // GoTrue, the flag from platform_admins; no workspace in the path, so this
  // runs behind authenticate alone.
  app.get('/api/me', { preHandler: [authenticate] }, async (request) => {
    if (!request.authUserId) throw ProblemError.unauthorized();
    const { db } = request.server.app;
    const [email, platformAdmin] = await Promise.all([
      getUserEmail(db, request.authUserId),
      isPlatformAdmin(db, request.authUserId),
    ]);
    return { userId: request.authUserId, email, platformAdmin };
  });

  // The workspaces the caller belongs to: the sign-in picker. No workspaceId in
  // the path, so this runs behind authenticate alone; membership IS the filter.
  app.get('/api/workspaces', { preHandler: [authenticate] }, async (request) => {
    if (!request.authUserId) throw ProblemError.unauthorized();
    const workspaces = await listWorkspacesForUser(request.server.app.db, request.authUserId);
    return { workspaces };
  });

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

  // One authoring-interview turn (ADR-0001/0004). The surface calls the
  // control plane; the control plane drives the named conversation
  // `authoring:<workspaceId>` on Hermes. Gated like the contract the interview
  // produces: publish_contract.
  app.post(
    '/api/workspaces/:workspaceId/authoring/turn',
    { preHandler: [authenticate, requireCapability('publish_contract')] },
    async (request) => {
      const ctx = requireCtx(request);
      const { runtime } = request.server.app;
      if (!runtime) {
        throw new ProblemError(503, 'runtime_unavailable', 'The agent runtime is not configured');
      }
      const { text } = authoringTurnBody.parse(request.body);
      return runtime.sendAuthoringTurn({ workspaceId: ctx.workspaceId, text });
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
