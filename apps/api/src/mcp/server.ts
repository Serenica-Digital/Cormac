import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildContextDisplay,
  LEARNED_KINDS,
  proposedChangeSchema,
  safeParseLearnedPayload,
  safeParseProposal,
  validateLearningAgainstContract,
  validateProposalAgainstContract,
  type Contract,
} from '@cormac/contract';
import type { AppContext } from '../app.js';
import {
  getActiveContract,
  getProposalBySourceMessage,
  getRecord,
  getSourceMessage,
  insertAuditEvent,
  insertLearnedKnowledge,
  insertProposal,
  listRecordSummaries,
} from '../repo.js';

/**
 * The control-plane tool surface for the agent runtime (ADR-025). The agent
 * works freely with the read tools and ends a successful task by calling
 * submit_proposal; the proposal schema lives on the tool, and the handler runs
 * the same contract validation the rest of the pipeline uses. Because the
 * control plane executes every tool, the write gate is intrinsic: nothing here
 * mutates business records, a proposal lands as pending and waits for a human
 * (ADR-005, ADR-010).
 *
 * Every server built here is bound to exactly one workspace, resolved from the
 * bearer token before construction. Tools cannot name a workspace.
 */

function jsonContent(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] };
}

function toolError(message: string): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

async function requireContract(app: AppContext, workspaceId: string): Promise<Contract> {
  const row = await getActiveContract(app.db, workspaceId);
  if (!row) throw new Error('workspace has no active contract');
  return row.document as Contract;
}

export function buildMcpServer(app: AppContext, workspaceId: string): McpServer {
  const server = new McpServer({ name: 'cormac-control-plane', version: '0.1.0' });

  server.registerTool(
    'get_active_contract',
    {
      title: 'Get the active contract',
      description:
        'Returns the published semantic contract this workspace runs on: objects, fields, ' +
        'types, enum options, identity rules, and which fields the agent may write ' +
        '(editableByAgent). Read it before proposing changes.',
      inputSchema: {},
    },
    async () => {
      const row = await getActiveContract(app.db, workspaceId);
      if (!row) return toolError('This workspace has no active contract.');
      return jsonContent({ version: row.version, contract: row.document });
    },
  );

  server.registerTool(
    'search_records',
    {
      title: 'Search records',
      description:
        'Case-insensitive search over existing records (display fields only; sensitive ' +
        'values are never returned). Use it to find the record an update refers to before ' +
        'proposing. Returns up to 20 matches with their record ids.',
      inputSchema: { query: z.string().min(1).max(200) },
    },
    async ({ query }) => {
      const contract = await requireContract(app, workspaceId);
      const summaries = await listRecordSummaries(app.db, workspaceId, contract);
      const needle = query.toLowerCase();
      const matches = summaries
        .filter((s) =>
          (s.objectApiName + ' ' + JSON.stringify(s.display)).toLowerCase().includes(needle),
        )
        .slice(0, 20);
      return jsonContent({ matchCount: matches.length, matches });
    },
  );

  server.registerTool(
    'get_record',
    {
      title: 'Get one record',
      description:
        'Fetch a single record by id for a before/after comparison. Sensitive field values ' +
        'are redacted; everything else is current state.',
      inputSchema: { recordId: z.string().uuid() },
    },
    async ({ recordId }) => {
      const contract = await requireContract(app, workspaceId);
      const row = await getRecord(app.db, workspaceId, recordId);
      if (!row) return toolError(`No record ${recordId} in this workspace.`);
      const object = contract.objects.find((o) => o.apiName === row.object_api_name);
      const display = object ? buildContextDisplay(object, row.data) : {};
      return jsonContent({ id: row.id, objectApiName: row.object_api_name, display });
    },
  );

  server.registerTool(
    'submit_proposal',
    {
      title: 'Submit the proposed changes',
      description:
        'The terminal action of a successful task. Submits the proposed record changes for ' +
        'this task; they are validated against the contract and held for human review, never ' +
        'applied directly. taskId is the task id you were given. If validation fails, fix the ' +
        'changes and submit again, or finish without submitting and explain why.',
      inputSchema: {
        taskId: z.string().uuid().describe('The task id from your instructions'),
        changes: z.array(proposedChangeSchema).min(1),
        notes: z.string().max(2000).optional(),
        uncertain: z
          .boolean()
          .default(false)
          .describe('Set true when a match or value is a guess a human should look at closely'),
      },
    },
    async ({ taskId, changes, notes, uncertain }) => {
      const source = await getSourceMessage(app.db, workspaceId, taskId);
      if (!source) return toolError(`Unknown taskId ${taskId}.`);

      const existing = await getProposalBySourceMessage(app.db, workspaceId, taskId);
      if (existing) {
        return toolError(`A proposal already exists for this task (${existing.id}).`);
      }

      const parsed = safeParseProposal({ changes, notes, uncertain });
      if (!parsed.success) {
        return toolError(`Proposal shape invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      }

      const contract = await requireContract(app, workspaceId);
      const validation = validateProposalAgainstContract(contract, parsed.data);
      if (!validation.ok) {
        return toolError(
          `Proposal violates the contract and was not held:\n- ${validation.errors.join('\n- ')}`,
        );
      }

      let row;
      try {
        row = await insertProposal(app.db, {
          workspaceId,
          sourceMessageId: taskId,
          payload: parsed.data,
          createdBy: source.user_id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('agent_proposals_one_per_source_message') ||
          message.includes('duplicate key') ||
          message.includes('23505')
        ) {
          return toolError('A proposal already exists for this task.');
        }
        throw err;
      }
      return jsonContent({
        proposalId: row.id,
        status: row.status,
        changeCount: parsed.data.changes.length,
      });
    },
  );

  server.registerTool(
    'propose_learning',
    {
      title: 'Propose a learned fact',
      description:
        'Record a small, typed fact you learned this task so the team can confirm it: an alias ' +
        '(a name or nickname that refers to one specific record) or an enum synonym (a word a ' +
        'user uses for a fixed option). It is HELD for human review, never applied directly, and ' +
        'never changes a record. Use it only for a real correction or a variant you had to infer; ' +
        'do not guess.',
      inputSchema: {
        taskId: z.string().uuid().describe('The task id from your instructions'),
        kind: z.enum(LEARNED_KINDS),
        payload: z.record(z.string(), z.unknown()).describe('The slot fields for this kind'),
        rationale: z.string().max(1000).optional(),
      },
    },
    async ({ taskId, kind, payload, rationale }) => {
      const source = await getSourceMessage(app.db, workspaceId, taskId);
      if (!source) return toolError(`Unknown taskId ${taskId}.`);

      const parsed = safeParseLearnedPayload(kind, payload);
      if (!parsed.success) {
        return toolError(
          `Learned payload invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        );
      }

      const contract = await requireContract(app, workspaceId);
      const validation = validateLearningAgainstContract(contract, kind, parsed.data);
      if (!validation.ok) {
        return toolError(
          `Learned fact violates the contract and was not held:\n- ${validation.errors.join('\n- ')}`,
        );
      }

      // An alias binds to one record; confirm it exists, is active, and is the
      // object the payload claims, before holding the fact.
      let recordId: string | null = null;
      if (kind === 'alias') {
        const aliasRecordId = (parsed.data as { recordId: string }).recordId;
        const record = await getRecord(app.db, workspaceId, aliasRecordId);
        if (!record || record.archived_at) {
          return toolError(`No active record ${aliasRecordId} to alias in this workspace.`);
        }
        if (record.object_api_name !== parsed.data.objectApiName) {
          return toolError(
            `Record ${aliasRecordId} is a ${record.object_api_name}, not a ${parsed.data.objectApiName}.`,
          );
        }
        recordId = aliasRecordId;
      }

      // Provenance: tie the fact to the proposal this task produced, if any.
      const proposal = await getProposalBySourceMessage(app.db, workspaceId, taskId);

      let row;
      try {
        row = await insertLearnedKnowledge(app.db, {
          workspaceId,
          kind,
          payload: parsed.data,
          recordId,
          sourceMessageId: taskId,
          proposalId: proposal?.id ?? null,
          proposedBy: null, // the agent, not a user
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('learned_knowledge_live_dedup') ||
          message.includes('duplicate key') ||
          message.includes('23505')
        ) {
          return toolError('That fact is already known or already pending review.');
        }
        throw err;
      }

      // confirm_each only (skeleton): the fact is HELD as 'proposed'. Under
      // apply_then_report (ADR-010, ADR-027 section 4) typed learning would
      // auto-activate here, be audited, and surface in the weekly report.
      await insertAuditEvent(app.db, {
        workspaceId,
        actorType: 'agent',
        actorId: null,
        action: 'learning_proposed',
        objectApiName: parsed.data.objectApiName,
        recordId,
        before: null,
        after: { kind, learnedId: row.id, rationale: rationale ?? null },
        sourceMessageId: taskId,
        proposalId: proposal?.id ?? null,
      });

      return jsonContent({ learnedId: row.id, status: row.status, kind });
    },
  );

  return server;
}
