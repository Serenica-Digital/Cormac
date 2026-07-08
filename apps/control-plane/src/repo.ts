import { buildContextDisplay, type Contract } from '@cormac/contract';
import type { Db } from './db.js';
import type {
  AuditEventRow,
  BusinessRecordRow,
  ContractVersionRow,
  ProposalRow,
  ProposalStatus,
  SourceChannel,
  WorkbookSnapshotRow,
  WorkspaceRow,
} from './rows.js';

/**
 * Every database read and write in the control plane goes through here, using
 * the service-role client. This is the single writer. Nothing else in the
 * system touches business records. Ported from v0 (archive/apps/api/src/
 * repo.ts) minus the learned-knowledge and telemetry functions (#35 and a
 * later observability task); plus the v2 workbook-snapshot reads.
 */

function must<T>(data: T | null, error: { message: string } | null, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  if (data === null) throw new Error(`${what}: no data returned`);
  return data;
}

export async function getWorkspace(db: Db, workspaceId: string): Promise<WorkspaceRow | null> {
  const { data, error } = await db.from('workspaces').select('*').eq('id', workspaceId).maybeSingle();
  if (error) throw new Error(`getWorkspace: ${error.message}`);
  return (data as WorkspaceRow | null) ?? null;
}

export async function getActiveContract(
  db: Db,
  workspaceId: string,
): Promise<ContractVersionRow | null> {
  const { data, error } = await db
    .from('contract_versions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`getActiveContract: ${error.message}`);
  return (data as ContractVersionRow | null) ?? null;
}

export interface RecordSummary {
  objectApiName: string;
  id: string;
  display: Record<string, unknown>;
}

/** Compact summaries of existing records so the agent can attempt matching. */
export async function listRecordSummaries(
  db: Db,
  workspaceId: string,
  contract: Contract,
  limit = 200,
): Promise<RecordSummary[]> {
  const { data, error } = await db
    .from('business_records')
    .select('id, object_api_name, data')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .limit(limit);
  if (error) throw new Error(`listRecordSummaries: ${error.message}`);
  const rows = (data as Pick<BusinessRecordRow, 'id' | 'object_api_name' | 'data'>[]) ?? [];

  return rows.map((row) => {
    const object = contract.objects.find((o) => o.apiName === row.object_api_name);
    // Minimization: sensitive field values never enter the model context.
    const display = object ? buildContextDisplay(object, row.data) : {};
    return { objectApiName: row.object_api_name, id: row.id, display };
  });
}

export async function insertSourceMessage(
  db: Db,
  input: { workspaceId: string; channel: SourceChannel; userId: string | null; content: string },
): Promise<string> {
  const { data, error } = await db
    .from('source_messages')
    .insert({
      workspace_id: input.workspaceId,
      channel: input.channel,
      user_id: input.userId,
      content: input.content,
    })
    .select('id')
    .single();
  const row = must(data as { id: string } | null, error, 'insertSourceMessage');
  return row.id;
}

export async function insertProposal(
  db: Db,
  input: {
    workspaceId: string;
    sourceMessageId: string;
    payload: unknown;
    createdBy: string | null;
  },
): Promise<ProposalRow> {
  const { data, error } = await db
    .from('agent_proposals')
    .insert({
      workspace_id: input.workspaceId,
      source_message_id: input.sourceMessageId,
      payload: input.payload,
      created_by: input.createdBy,
      status: 'pending',
    })
    .select('*')
    .single();
  return must(data as ProposalRow | null, error, 'insertProposal');
}

export interface SourceMessageRef {
  id: string;
  user_id: string | null;
}

export async function getSourceMessage(
  db: Db,
  workspaceId: string,
  sourceMessageId: string,
): Promise<SourceMessageRef | null> {
  const { data, error } = await db
    .from('source_messages')
    .select('id, user_id')
    .eq('workspace_id', workspaceId)
    .eq('id', sourceMessageId)
    .maybeSingle();
  if (error) throw new Error(`getSourceMessage: ${error.message}`);
  return (data as SourceMessageRef | null) ?? null;
}

export async function getProposalBySourceMessage(
  db: Db,
  workspaceId: string,
  sourceMessageId: string,
): Promise<ProposalRow | null> {
  const { data, error } = await db
    .from('agent_proposals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('source_message_id', sourceMessageId)
    .maybeSingle();
  if (error) throw new Error(`getProposalBySourceMessage: ${error.message}`);
  return (data as ProposalRow | null) ?? null;
}

export async function getProposal(
  db: Db,
  workspaceId: string,
  proposalId: string,
): Promise<ProposalRow | null> {
  const { data, error } = await db
    .from('agent_proposals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', proposalId)
    .maybeSingle();
  if (error) throw new Error(`getProposal: ${error.message}`);
  return (data as ProposalRow | null) ?? null;
}

export async function listProposals(
  db: Db,
  workspaceId: string,
  status?: ProposalStatus,
): Promise<ProposalRow[]> {
  let query = db
    .from('agent_proposals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(`listProposals: ${error.message}`);
  return (data as ProposalRow[] | null) ?? [];
}

export async function getRecord(
  db: Db,
  workspaceId: string,
  recordId: string,
): Promise<BusinessRecordRow | null> {
  const { data, error } = await db
    .from('business_records')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', recordId)
    .maybeSingle();
  if (error) throw new Error(`getRecord: ${error.message}`);
  return (data as BusinessRecordRow | null) ?? null;
}

export async function listRecords(
  db: Db,
  workspaceId: string,
  objectApiName?: string,
): Promise<BusinessRecordRow[]> {
  let query = db
    .from('business_records')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  if (objectApiName) query = query.eq('object_api_name', objectApiName);
  const { data, error } = await query;
  if (error) throw new Error(`listRecords: ${error.message}`);
  return (data as BusinessRecordRow[] | null) ?? [];
}

export async function insertAuditEvent(
  db: Db,
  input: {
    workspaceId: string;
    actorType: 'user' | 'agent';
    actorId: string | null;
    action: string;
    objectApiName: string | null;
    recordId: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    sourceMessageId: string | null;
    proposalId: string | null;
  },
): Promise<void> {
  const { error } = await db.from('audit_events').insert({
    workspace_id: input.workspaceId,
    actor_type: input.actorType,
    actor_id: input.actorId,
    action: input.action,
    object_api_name: input.objectApiName,
    record_id: input.recordId,
    before: input.before,
    after: input.after,
    source_message_id: input.sourceMessageId,
    proposal_id: input.proposalId,
  });
  if (error) throw new Error(`insertAuditEvent: ${error.message}`);
}

export async function listAuditEvents(db: Db, workspaceId: string): Promise<AuditEventRow[]> {
  const { data, error } = await db
    .from('audit_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listAuditEvents: ${error.message}`);
  return (data as AuditEventRow[] | null) ?? [];
}

export async function listAuditEventsForRecord(
  db: Db,
  workspaceId: string,
  recordId: string,
): Promise<AuditEventRow[]> {
  const { data, error } = await db
    .from('audit_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listAuditEventsForRecord: ${error.message}`);
  return (data as AuditEventRow[] | null) ?? [];
}

export interface SourceMessageContent {
  id: string;
  channel: SourceChannel;
  content: string;
  created_at: string;
}

export async function getSourceMessageContents(
  db: Db,
  workspaceId: string,
  ids: string[],
): Promise<SourceMessageContent[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('source_messages')
    .select('id, channel, content, created_at')
    .eq('workspace_id', workspaceId)
    .in('id', ids);
  if (error) throw new Error(`getSourceMessageContents: ${error.message}`);
  return (data as SourceMessageContent[] | null) ?? [];
}

export async function getProposalStatuses(
  db: Db,
  workspaceId: string,
  ids: string[],
): Promise<Array<{ id: string; status: ProposalStatus }>> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('agent_proposals')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .in('id', ids);
  if (error) throw new Error(`getProposalStatuses: ${error.message}`);
  return (data as Array<{ id: string; status: ProposalStatus }> | null) ?? [];
}

export interface WorkspaceMembership {
  id: string;
  name: string;
  role: string;
}

/** Every workspace the user belongs to, with their role: the sign-in picker. */
export async function listWorkspacesForUser(
  db: Db,
  userId: string,
): Promise<WorkspaceMembership[]> {
  const { data, error } = await db
    .from('memberships')
    .select('role, workspaces(id, name)')
    .eq('user_id', userId);
  if (error) throw new Error(`listWorkspacesForUser: ${error.message}`);
  // supabase-js cannot know the FK is to-one, so it types the embed loosely;
  // normalize object-or-array to one workspace row.
  const rows =
    (data as unknown as Array<{
      role: string;
      workspaces: { id: string; name: string } | Array<{ id: string; name: string }> | null;
    }>) ?? [];
  return rows.flatMap((r) => {
    const ws = Array.isArray(r.workspaces) ? r.workspaces[0] : r.workspaces;
    return ws ? [{ id: ws.id, name: ws.name, role: r.role }] : [];
  });
}

export async function setProposalDecision(
  db: Db,
  input: {
    workspaceId: string;
    proposalId: string;
    status: ProposalStatus;
    decidedBy: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from('agent_proposals')
    .update({
      status: input.status,
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
    })
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.proposalId);
  if (error) throw new Error(`setProposalDecision: ${error.message}`);
}

// --- Workbook snapshots (v2, the read_workbook binding's store) -------------

export async function insertWorkbookSnapshot(
  db: Db,
  input: {
    workspaceId: string;
    name: string;
    profile: Record<string, unknown>;
    createdBy: string | null;
  },
): Promise<WorkbookSnapshotRow> {
  const { data, error } = await db
    .from('workbook_snapshots')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      profile: input.profile,
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  return must(data as WorkbookSnapshotRow | null, error, 'insertWorkbookSnapshot');
}

/** The latest snapshot per (workspace, name) is the served profile. */
export async function getLatestWorkbookSnapshot(
  db: Db,
  workspaceId: string,
  name: string,
): Promise<WorkbookSnapshotRow | null> {
  const { data, error } = await db
    .from('workbook_snapshots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestWorkbookSnapshot: ${error.message}`);
  return (data as WorkbookSnapshotRow | null) ?? null;
}
