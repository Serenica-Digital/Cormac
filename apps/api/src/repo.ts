import { buildContextDisplay, type Contract } from '@serenica/contract';
import {
  TABLES,
  type AuditEventRow,
  type BusinessRecordRow,
  type ContractVersionRow,
  type Db,
  type ProposalRow,
  type ProposalStatus,
  type SourceChannel,
  type WorkspaceRow,
} from '@serenica/db';
import type { RuntimeRecordSummary } from './adapter/runtime.js';

/**
 * Every database read and write in the control plane goes through here, using
 * the service-role client. This is the single writer (ADR-005). Nothing else in
 * the system touches business records.
 */

function must<T>(data: T | null, error: { message: string } | null, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  if (data === null) throw new Error(`${what}: no data returned`);
  return data;
}

export async function getWorkspace(db: Db, workspaceId: string): Promise<WorkspaceRow | null> {
  const { data, error } = await db
    .from(TABLES.workspaces)
    .select('*')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) throw new Error(`getWorkspace: ${error.message}`);
  return (data as WorkspaceRow | null) ?? null;
}

export async function getActiveContract(
  db: Db,
  workspaceId: string,
): Promise<ContractVersionRow | null> {
  const { data, error } = await db
    .from(TABLES.contractVersions)
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`getActiveContract: ${error.message}`);
  return (data as ContractVersionRow | null) ?? null;
}

/** Compact summaries of existing records so the runtime can attempt matching. */
export async function listRecordSummaries(
  db: Db,
  workspaceId: string,
  contract: Contract,
  limit = 200,
): Promise<RuntimeRecordSummary[]> {
  const { data, error } = await db
    .from(TABLES.businessRecords)
    .select('id, object_api_name, data')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .limit(limit);
  if (error) throw new Error(`listRecordSummaries: ${error.message}`);
  const rows = (data as Pick<BusinessRecordRow, 'id' | 'object_api_name' | 'data'>[]) ?? [];

  return rows.map((row) => {
    const object = contract.objects.find((o) => o.apiName === row.object_api_name);
    // Minimization: sensitive field values never enter the model context (ADR-015).
    const display = object ? buildContextDisplay(object, row.data) : {};
    return { objectApiName: row.object_api_name, id: row.id, display };
  });
}

export async function insertSourceMessage(
  db: Db,
  input: { workspaceId: string; channel: SourceChannel; userId: string | null; content: string },
): Promise<string> {
  const { data, error } = await db
    .from(TABLES.sourceMessages)
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
    .from(TABLES.proposals)
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

export async function getProposal(
  db: Db,
  workspaceId: string,
  proposalId: string,
): Promise<ProposalRow | null> {
  const { data, error } = await db
    .from(TABLES.proposals)
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
    .from(TABLES.proposals)
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
    .from(TABLES.businessRecords)
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
    .from(TABLES.businessRecords)
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  if (objectApiName) query = query.eq('object_api_name', objectApiName);
  const { data, error } = await query;
  if (error) throw new Error(`listRecords: ${error.message}`);
  return (data as BusinessRecordRow[] | null) ?? [];
}

export async function createRecord(
  db: Db,
  input: {
    workspaceId: string;
    objectApiName: string;
    contractVersionId: string;
    data: Record<string, unknown>;
    actorId: string | null;
  },
): Promise<BusinessRecordRow> {
  const { data, error } = await db
    .from(TABLES.businessRecords)
    .insert({
      workspace_id: input.workspaceId,
      object_api_name: input.objectApiName,
      contract_version_id: input.contractVersionId,
      data: input.data,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select('*')
    .single();
  return must(data as BusinessRecordRow | null, error, 'createRecord');
}

export async function updateRecordData(
  db: Db,
  input: {
    workspaceId: string;
    recordId: string;
    data: Record<string, unknown>;
    actorId: string | null;
  },
): Promise<BusinessRecordRow> {
  const { data, error } = await db
    .from(TABLES.businessRecords)
    .update({
      data: input.data,
      updated_by: input.actorId,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.recordId)
    .select('*')
    .single();
  return must(data as BusinessRecordRow | null, error, 'updateRecordData');
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
  const { error } = await db.from(TABLES.auditEvents).insert({
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
    .from(TABLES.auditEvents)
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listAuditEvents: ${error.message}`);
  return (data as AuditEventRow[] | null) ?? [];
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
    .from(TABLES.proposals)
    .update({
      status: input.status,
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
    })
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.proposalId);
  if (error) throw new Error(`setProposalDecision: ${error.message}`);
}
