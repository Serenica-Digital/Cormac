import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import {
  buildContextDisplay,
  parseContract,
  safeParseProposal,
  validateProposalAgainstContract,
  type Contract,
} from '@cormac/contract';
import { ProblemError } from '../shared.js';
import { requireAgentCapability, requireAgentCtx } from '../auth.js';
import { publishContract } from '../pipeline/contract.js';
import {
  getActiveContract,
  getLatestWorkbookSnapshot,
  getProposalBySourceMessage,
  getRecord,
  getSourceMessage,
  insertProposal,
  listRecordSummaries,
} from '../repo.js';

const submitContractBody = z.object({ contract: z.unknown() });
const submitProposalBody = z.object({
  taskId: z.string().uuid(),
  changes: z.array(z.unknown()).min(1),
  notes: z.string().max(2000).optional(),
  uncertain: z.boolean().optional(),
});

function contractSummary(contract: Contract, version: number): string {
  const objects = contract.objects.map((o) => `${o.apiName}(${o.fields.length} fields)`).join(', ');
  return `contract "${contract.name}" v${version}: ${contract.objects.length} object(s): ${objects}; glossary ${contract.glossary.length} entr(ies)`;
}

/**
 * The agent surface (ADR-0005): what the runtime's bundled tools call. Auth is
 * a workspace-scoped agent token; the per-agent-kind capability split is
 * enforced in the guard (authoring: workbook read + contract submit;
 * operations: contract read, redacted record reads, proposal submit). The
 * validation gates are ports of v0's MCP tool handlers — the mount changed
 * (ADR-0001: MCP is never internal plumbing), the gates did not.
 */
export function registerAgentRoutes(app: FastifyInstance): void {
  // read_workbook: the latest detection profile for the named workbook.
  app.get(
    '/agent/workbook',
    { preHandler: [requireAgentCapability('read_workbook')] },
    async (request) => {
      const ctx = requireAgentCtx(request);
      const { name } = request.query as { name?: string };
      if (!name) throw ProblemError.badRequest('Missing workbook name');
      const snapshot = await getLatestWorkbookSnapshot(request.server.app.db, ctx.workspaceId, name);
      if (!snapshot) throw ProblemError.notFound(`No workbook snapshot named "${name}"`);
      return snapshot.profile;
    },
  );

  // submit_contract: the validating publish gate. The response mirrors the
  // spike validator exactly (the repair signal must not change shape):
  // 200 {valid:true, summary, version, contractVersionId} on publish;
  // 422 {valid:false, issues:[{path, message}]} with verbatim Zod issues on
  // failure, nothing published.
  app.post(
    '/agent/contract/submit',
    { preHandler: [requireAgentCapability('submit_contract')] },
    async (request, reply) => {
      const ctx = requireAgentCtx(request);
      const { contract } = submitContractBody.parse(request.body);

      let parsed: Contract;
      try {
        parsed = parseContract(contract);
      } catch (err) {
        if (err instanceof ZodError) {
          const issues = err.issues.map((i) => ({
            path: i.path.length ? i.path.join('.') : '(root)',
            message: i.message,
          }));
          return reply.status(422).send({ valid: false, issues });
        }
        return reply.status(422).send({
          valid: false,
          issues: [{ path: '(root)', message: err instanceof Error ? err.message : String(err) }],
        });
      }

      const result = await publishContract(
        request.server.app,
        { workspaceId: ctx.workspaceId, actorId: null },
        parsed,
      );
      return {
        valid: true,
        summary: contractSummary(parsed, result.version),
        version: result.version,
        contractVersionId: result.contract_version_id,
      };
    },
  );

  // get_active_contract (operations).
  app.get(
    '/agent/contract',
    { preHandler: [requireAgentCapability('read_contract')] },
    async (request) => {
      const ctx = requireAgentCtx(request);
      const row = await getActiveContract(request.server.app.db, ctx.workspaceId);
      if (!row) throw ProblemError.notFound('No active contract for this workspace');
      return { version: row.version, contract: row.document };
    },
  );

  // search_records (operations): display fields only, sensitive values never
  // leave the trust boundary; max 20 matches (the v0 tool's shape).
  app.get(
    '/agent/records',
    { preHandler: [requireAgentCapability('read_records')] },
    async (request) => {
      const ctx = requireAgentCtx(request);
      const { query } = request.query as { query?: string };
      if (!query) throw ProblemError.badRequest('Missing query');

      const contractRow = await getActiveContract(request.server.app.db, ctx.workspaceId);
      if (!contractRow) throw ProblemError.unprocessable('This workspace has no active contract');

      const summaries = await listRecordSummaries(
        request.server.app.db,
        ctx.workspaceId,
        contractRow.document as Contract,
      );
      const needle = query.toLowerCase();
      const matches = summaries
        .filter((s) =>
          Object.values(s.display).some(
            (v) => typeof v === 'string' && v.toLowerCase().includes(needle),
          ),
        )
        .slice(0, 20);
      return { matchCount: matches.length, matches };
    },
  );

  // get_record (operations): one record, sensitive fields redacted.
  app.get(
    '/agent/records/:recordId',
    { preHandler: [requireAgentCapability('read_records')] },
    async (request) => {
      const ctx = requireAgentCtx(request);
      const { recordId } = request.params as { recordId: string };
      const record = await getRecord(request.server.app.db, ctx.workspaceId, recordId);
      if (!record || record.archived_at) throw ProblemError.notFound('Record not found');

      const contractRow = await getActiveContract(request.server.app.db, ctx.workspaceId);
      if (!contractRow) throw ProblemError.unprocessable('This workspace has no active contract');
      const contract = contractRow.document as Contract;
      const object = contract.objects.find((o) => o.apiName === record.object_api_name);
      const display = object ? buildContextDisplay(object, record.data) : {};
      return { id: record.id, objectApiName: record.object_api_name, display };
    },
  );

  // submit_proposal (operations): validate against the active contract and
  // HOLD as pending. Nothing is written to business records here; the human
  // decision route applies it later. Ported from v0's MCP submit_proposal gate.
  app.post(
    '/agent/proposals',
    { preHandler: [requireAgentCapability('submit_proposal')] },
    async (request) => {
      const ctx = requireAgentCtx(request);
      const body = submitProposalBody.parse(request.body);

      // The taskId is the source message the control plane created at capture;
      // an agent cannot invent one.
      const source = await getSourceMessage(request.server.app.db, ctx.workspaceId, body.taskId);
      if (!source) throw ProblemError.notFound('Unknown task');

      const parsed = safeParseProposal({
        changes: body.changes,
        notes: body.notes,
        uncertain: body.uncertain ?? false,
      });
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        throw ProblemError.unprocessable('Proposal shape is invalid', detail);
      }

      const contractRow = await getActiveContract(request.server.app.db, ctx.workspaceId);
      if (!contractRow) throw ProblemError.unprocessable('This workspace has no active contract');
      const validation = validateProposalAgainstContract(
        contractRow.document as Contract,
        parsed.data,
      );
      if (!validation.ok) {
        throw ProblemError.unprocessable(
          'Proposal violates the contract and was not held',
          validation.errors.join('; '),
        );
      }

      // One proposal per task; the DB unique index backs this check under races.
      const existing = await getProposalBySourceMessage(
        request.server.app.db,
        ctx.workspaceId,
        body.taskId,
      );
      if (existing) {
        throw ProblemError.unprocessable('This task already holds a proposal');
      }

      const row = await insertProposal(request.server.app.db, {
        workspaceId: ctx.workspaceId,
        sourceMessageId: body.taskId,
        payload: parsed.data,
        createdBy: null,
      });
      return { proposalId: row.id, status: row.status, changeCount: parsed.data.changes.length };
    },
  );
}
