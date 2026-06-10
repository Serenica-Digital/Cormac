import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  buildContextDisplay,
  proposedChangeSchema,
  safeParseProposal,
  validateProposalAgainstContract,
  type Contract,
} from '@serenica/contract';
import type { AppContext } from '../app.js';
import {
  getActiveContract,
  getProposalBySourceMessage,
  getRecord,
  getSourceMessage,
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
  const server = new McpServer({ name: 'serenica-control-plane', version: '0.1.0' });

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

      const row = await insertProposal(app.db, {
        workspaceId,
        sourceMessageId: taskId,
        payload: parsed.data,
        createdBy: source.user_id,
      });
      return jsonContent({
        proposalId: row.id,
        status: row.status,
        changeCount: parsed.data.changes.length,
      });
    },
  );

  return server;
}
