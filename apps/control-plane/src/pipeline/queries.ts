import { parseProposal } from '@cormac/contract';
import type { AppContext } from '../app.js';
import type { ProposalStatus } from '../rows.js';
import {
  getProposalStatuses,
  getRecord,
  getSourceMessageContents,
  listAuditEventsForRecord,
  listProposals,
} from '../repo.js';

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

export interface TimelineEntry {
  id: string;
  at: string;
  actorType: 'user' | 'agent';
  action: string;
  /** The original natural-language message that led to this change, if any. */
  utterance: string | null;
  channel: string | null;
  proposalId: string | null;
  proposalStatus: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * The per-record timeline: the record's audit events joined with the source
 * message that caused each one and the proposal it rode through. A read view
 * over what the pipeline already keeps; nothing here writes. Events without a
 * record_id (e.g. proposal rejections) do not appear; the review queue's
 * history covers those.
 */
export async function recordTimeline(
  app: AppContext,
  workspaceId: string,
  recordId: string,
): Promise<TimelineEntry[]> {
  const events = await listAuditEventsForRecord(app.db, workspaceId, recordId);

  const messageIds = [...new Set(events.map((e) => e.source_message_id).filter(Boolean))] as string[];
  const proposalIds = [...new Set(events.map((e) => e.proposal_id).filter(Boolean))] as string[];
  const [messages, proposals] = await Promise.all([
    getSourceMessageContents(app.db, workspaceId, messageIds),
    getProposalStatuses(app.db, workspaceId, proposalIds),
  ]);
  const messageById = new Map(messages.map((m) => [m.id, m]));
  const statusById = new Map(proposals.map((p) => [p.id, p.status]));

  return events.map((e) => {
    const message = e.source_message_id ? messageById.get(e.source_message_id) : undefined;
    return {
      id: e.id,
      at: e.created_at,
      actorType: e.actor_type,
      action: e.action,
      utterance: message?.content ?? null,
      channel: message?.channel ?? null,
      proposalId: e.proposal_id,
      proposalStatus: e.proposal_id ? (statusById.get(e.proposal_id) ?? null) : null,
      before: e.before,
      after: e.after,
    };
  });
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
