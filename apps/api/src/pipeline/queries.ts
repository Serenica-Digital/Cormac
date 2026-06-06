import { parseProposal } from '@serenica/contract';
import type { ProposalStatus } from '@serenica/db';
import type { AppContext } from '../app.js';
import { getRecord, listProposals } from '../repo.js';

export interface ProposalChangeView {
  objectApiName: string;
  op: 'create' | 'update';
  recordId: string | null;
  values: Record<string, unknown>;
  /** Current stored data for an update target, so the UI can show before/after. */
  current: Record<string, unknown> | null;
}

export interface ProposalView {
  id: string;
  status: string;
  createdAt: string;
  sourceMessageId: string;
  uncertain: boolean;
  notes?: string;
  changes: ProposalChangeView[];
}

export async function proposalsView(
  app: AppContext,
  workspaceId: string,
  status?: ProposalStatus,
): Promise<ProposalView[]> {
  const rows = await listProposals(app.db, workspaceId, status);
  const views: ProposalView[] = [];

  for (const row of rows) {
    const proposal = parseProposal(row.payload);
    const changes: ProposalChangeView[] = [];
    for (const change of proposal.changes) {
      let current: Record<string, unknown> | null = null;
      if (change.op === 'update' && change.recordId) {
        const record = await getRecord(app.db, workspaceId, change.recordId);
        current = record?.data ?? null;
      }
      changes.push({
        objectApiName: change.objectApiName,
        op: change.op,
        recordId: change.recordId ?? null,
        values: change.values,
        current,
      });
    }
    views.push({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      sourceMessageId: row.source_message_id,
      uncertain: proposal.uncertain,
      notes: proposal.notes,
      changes,
    });
  }

  return views;
}
