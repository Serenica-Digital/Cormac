import { parseProposal } from '@cormac/contract';
import type { AppContext } from '../app.js';
import type { ProposalStatus } from '../rows.js';
import {
  getProposalStatuses,
  getRecord,
  getSourceMessageContents,
  getUserEmail,
  listAuditEventsForRecord,
  listConversationMessages,
  listProposalMeta,
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
  /** When a decision landed (applied/rejected); null while pending. */
  decidedAt: string | null;
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
  /**
   * True when the change was authored directly by a human (grid edit,
   * import): the source content is provenance, not something anyone said,
   * so the UI must not quote it.
   */
  direct: boolean;
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
  const proposalById = new Map(proposals.map((p) => [p.id, p]));

  return events.map((e) => {
    const message = e.source_message_id ? messageById.get(e.source_message_id) : undefined;
    const proposal = e.proposal_id ? proposalById.get(e.proposal_id) : undefined;
    return {
      id: e.id,
      at: e.created_at,
      actorType: e.actor_type,
      action: e.action,
      utterance: message?.content ?? null,
      channel: message?.channel ?? null,
      proposalId: e.proposal_id,
      proposalStatus: proposal?.status ?? null,
      direct: proposal?.created_by != null,
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
      decidedAt: row.decided_at,
      sourceMessageId: row.source_message_id,
      uncertain: proposal.uncertain,
      notes: proposal.notes,
      changes,
    });
  }

  return views;
}

export interface ConversationEntry {
  /** Source message id, or `<id>:note` for the agent's reply to it. */
  id: string;
  at: string;
  role: 'user' | 'cormac';
  text: string;
  channel: string | null;
  /** The author's email for user turns, so teammates can tell who spoke. */
  author: string | null;
}

/**
 * The Cormac conversation as a server-side view over the pipeline's own
 * tables: user turns are source_messages, agent turns are the stored
 * agent_note (a held proposal is the agent's reply and rides the proposals
 * query instead). Direct-edit and import provenance rows (their proposal has
 * a human `created_by`) are bookkeeping, not speech, and never appear.
 */
export async function conversationView(
  app: AppContext,
  workspaceId: string,
  limit = 200,
): Promise<ConversationEntry[]> {
  const [messages, proposals] = await Promise.all([
    listConversationMessages(app.db, workspaceId, limit),
    listProposalMeta(app.db, workspaceId),
  ]);
  const directSources = new Set(
    proposals.filter((p) => p.created_by != null).map((p) => p.source_message_id),
  );

  const emails = new Map<string, string | null>();
  for (const m of messages) {
    if (m.user_id && !emails.has(m.user_id)) {
      emails.set(m.user_id, await getUserEmail(app.db, m.user_id));
    }
  }

  const entries: ConversationEntry[] = [];
  for (const m of messages) {
    if (directSources.has(m.id)) continue;
    entries.push({
      id: m.id,
      at: m.created_at,
      role: 'user',
      text: m.content,
      channel: m.channel,
      author: m.user_id ? (emails.get(m.user_id) ?? null) : null,
    });
    if (m.agent_note) {
      entries.push({
        id: `${m.id}:note`,
        at: m.created_at,
        role: 'cormac',
        text: m.agent_note,
        channel: null,
        author: null,
      });
    }
  }
  return entries;
}
