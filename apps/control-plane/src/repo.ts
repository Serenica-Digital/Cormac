import { buildContextDisplay, type Contract, type LearnedView } from '@cormac/contract';
import type { Role } from './shared.js';
import type { Db } from './db.js';
import type {
  AuditEventRow,
  BusinessRecordRow,
  ContractVersionRow,
  LearnedKnowledgeRow,
  LearnedStatus,
  MembershipRow,
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

/** Store the agent's conversational reply on the message it answered. */
export async function setSourceMessageAgentNote(
  db: Db,
  input: { workspaceId: string; sourceMessageId: string; note: string },
): Promise<void> {
  const { error } = await db
    .from('source_messages')
    .update({ agent_note: input.note })
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.sourceMessageId);
  if (error) throw new Error(`setSourceMessageAgentNote: ${error.message}`);
}

export interface ConversationMessageRow {
  id: string;
  channel: SourceChannel;
  user_id: string | null;
  content: string;
  agent_note: string | null;
  created_at: string;
}

/** The most recent messages of a workspace's conversation, oldest first. */
export async function listConversationMessages(
  db: Db,
  workspaceId: string,
  limit: number,
): Promise<ConversationMessageRow[]> {
  const { data, error } = await db
    .from('source_messages')
    .select('id, channel, user_id, content, agent_note, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listConversationMessages: ${error.message}`);
  return (((data as ConversationMessageRow[] | null) ?? [])).reverse();
}

export interface ProposalMetaRow {
  id: string;
  source_message_id: string;
  status: ProposalStatus;
  created_by: string | null;
}

/** Lightweight proposal metadata for the whole workspace (conversation view). */
export async function listProposalMeta(db: Db, workspaceId: string): Promise<ProposalMetaRow[]> {
  const { data, error } = await db
    .from('agent_proposals')
    .select('id, source_message_id, status, created_by')
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`listProposalMeta: ${error.message}`);
  return (data as ProposalMetaRow[] | null) ?? [];
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
): Promise<Array<{ id: string; status: ProposalStatus; created_by: string | null }>> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('agent_proposals')
    .select('id, status, created_by')
    .eq('workspace_id', workspaceId)
    .in('id', ids);
  if (error) throw new Error(`getProposalStatuses: ${error.message}`);
  return (
    (data as Array<{ id: string; status: ProposalStatus; created_by: string | null }> | null) ?? []
  );
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

/** The workspace's most recent upload, regardless of name. */
export async function getLatestWorkbookSnapshotAny(
  db: Db,
  workspaceId: string,
): Promise<WorkbookSnapshotRow | null> {
  const { data, error } = await db
    .from('workbook_snapshots')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestWorkbookSnapshotAny: ${error.message}`);
  return (data as WorkbookSnapshotRow | null) ?? null;
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

// --- Memberships and identity (member management + /api/me) ----------------

export async function listMemberships(db: Db, workspaceId: string): Promise<MembershipRow[]> {
  const { data, error } = await db
    .from('memberships')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listMemberships: ${error.message}`);
  return (data as MembershipRow[] | null) ?? [];
}

export async function getMembership(
  db: Db,
  workspaceId: string,
  userId: string,
): Promise<MembershipRow | null> {
  const { data, error } = await db
    .from('memberships')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`getMembership: ${error.message}`);
  return (data as MembershipRow | null) ?? null;
}

export async function insertMembership(
  db: Db,
  input: { workspaceId: string; userId: string; role: Role },
): Promise<MembershipRow> {
  const { data, error } = await db
    .from('memberships')
    .insert({ workspace_id: input.workspaceId, user_id: input.userId, role: input.role })
    .select('*')
    .single();
  return must(data as MembershipRow | null, error, 'insertMembership');
}

export async function updateMembershipRole(
  db: Db,
  input: { workspaceId: string; userId: string; role: Role },
): Promise<void> {
  const { error } = await db
    .from('memberships')
    .update({ role: input.role })
    .eq('workspace_id', input.workspaceId)
    .eq('user_id', input.userId);
  if (error) throw new Error(`updateMembershipRole: ${error.message}`);
}

export async function deleteMembership(
  db: Db,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from('memberships')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);
  if (error) throw new Error(`deleteMembership: ${error.message}`);
}

export async function countOwners(db: Db, workspaceId: string): Promise<number> {
  const { count, error } = await db
    .from('memberships')
    .select('user_id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner');
  if (error) throw new Error(`countOwners: ${error.message}`);
  return count ?? 0;
}

export async function getUserEmail(db: Db, userId: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) throw new Error(`getUserEmail: ${error.message}`);
  return data.user?.email ?? null;
}

/**
 * Resolve an email to an auth user, creating one if needed. Created users get
 * no password: they sign in via an OAuth provider or a magic link (the
 * PR-6 auth-providers work). GoTrue admin has no lookup-by-email, so the
 * exists case pages through listUsers; fine at prototype scale.
 */
export async function findOrCreateAuthUserByEmail(
  db: Db,
  email: string,
): Promise<{ userId: string; created: boolean }> {
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (!created.error) return { userId: created.data.user!.id, created: true };
  const code = (created.error as { code?: string }).code;
  if (code !== 'email_exists' && code !== 'user_already_exists') {
    throw new Error(`findOrCreateAuthUserByEmail(${email}): ${created.error.message}`);
  }
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const res = await db.auth.admin.listUsers({ page, perPage });
    if (res.error) throw new Error(`findOrCreateAuthUserByEmail listUsers: ${res.error.message}`);
    const hit = res.data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return { userId: hit.id, created: false };
    if (res.data.users.length < perPage) break;
  }
  throw new Error(`findOrCreateAuthUserByEmail(${email}): user exists but scan did not find it`);
}

export async function isPlatformAdmin(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`isPlatformAdmin: ${error.message}`);
  return data !== null;
}

// --- Operator surface (platform administration) -----------------------------

export async function listAllWorkspaces(db: Db): Promise<WorkspaceRow[]> {
  const { data, error } = await db
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listAllWorkspaces: ${error.message}`);
  return (data as WorkspaceRow[] | null) ?? [];
}

export async function insertWorkspace(db: Db, name: string): Promise<WorkspaceRow> {
  const { data, error } = await db.from('workspaces').insert({ name }).select('*').single();
  return must(data as WorkspaceRow | null, error, 'insertWorkspace');
}

export interface WorkspaceStats {
  memberCount: number;
  contractVersion: number | null;
  recordCount: number;
  pendingProposalCount: number;
  lastAuditAt: string | null;
}

/** Five queries per workspace: naive, and fine at prototype scale. */
export async function getWorkspaceStats(db: Db, workspaceId: string): Promise<WorkspaceStats> {
  const [members, contract, records, pending, lastAudit] = await Promise.all([
    db
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    getActiveContract(db, workspaceId),
    db
      .from('business_records')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('archived_at', null),
    db
      .from('agent_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending'),
    db
      .from('audit_events')
      .select('created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const [what, res] of [
    ['memberships', members],
    ['business_records', records],
    ['agent_proposals', pending],
    ['audit_events', lastAudit],
  ] as const) {
    if (res.error) throw new Error(`getWorkspaceStats(${what}): ${res.error.message}`);
  }

  return {
    memberCount: members.count ?? 0,
    contractVersion: contract?.version ?? null,
    recordCount: records.count ?? 0,
    pendingProposalCount: pending.count ?? 0,
    lastAuditAt: (lastAudit.data as { created_at: string } | null)?.created_at ?? null,
  };
}

/**
 * Agent-token reads for the operator surface. token_hash is never selected:
 * even the hash stays out of every response path by construction.
 */
export interface AgentTokenSafe {
  id: string;
  workspace_id: string;
  agent: string;
  created_at: string;
  revoked_at: string | null;
}

const AGENT_TOKEN_SAFE_COLUMNS = 'id, workspace_id, agent, created_at, revoked_at';

export async function listAgentTokensSafe(db: Db, workspaceId: string): Promise<AgentTokenSafe[]> {
  const { data, error } = await db
    .from('agent_tokens')
    .select(AGENT_TOKEN_SAFE_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listAgentTokensSafe: ${error.message}`);
  return (data as AgentTokenSafe[] | null) ?? [];
}

export async function getAgentTokenSafe(db: Db, tokenId: string): Promise<AgentTokenSafe | null> {
  const { data, error } = await db
    .from('agent_tokens')
    .select(AGENT_TOKEN_SAFE_COLUMNS)
    .eq('id', tokenId)
    .maybeSingle();
  if (error) throw new Error(`getAgentTokenSafe: ${error.message}`);
  return (data as AgentTokenSafe | null) ?? null;
}

export async function revokeAgentToken(db: Db, tokenId: string): Promise<void> {
  const { error } = await db
    .from('agent_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .is('revoked_at', null);
  if (error) throw new Error(`revokeAgentToken: ${error.message}`);
}

// --- History search (the agent's recall path; knowledge-layer spike) ---------

export interface SourceMessageHit {
  id: string;
  channel: SourceChannel;
  content: string;
  agent_note: string | null;
  created_at: string;
}

/**
 * Case-insensitive substring search over a workspace's source messages, most
 * recent first. Content here is what users typed into capture (plus the
 * agent's stored reply); record values and sensitive fields never live in this
 * table, so returning matches to the agent stays inside what it already saw.
 */
export async function searchSourceMessages(
  db: Db,
  workspaceId: string,
  query: string,
  limit: number,
): Promise<SourceMessageHit[]> {
  // Escape LIKE wildcards; strip PostgREST or= syntax characters (comma,
  // parens) rather than escaping them — they are never load-bearing in a
  // human search needle.
  const escaped = query.replace(/[%_\\]/g, (m) => `\\${m}`).replace(/[(),]/g, ' ');
  const { data, error } = await db
    .from('source_messages')
    .select('id, channel, content, agent_note, created_at')
    .eq('workspace_id', workspaceId)
    .or(`content.ilike.%${escaped}%,agent_note.ilike.%${escaped}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`searchSourceMessages: ${error.message}`);
  return (data as SourceMessageHit[] | null) ?? [];
}

// --- Learned knowledge (governed typed learning; knowledge-layer spike) ------

export async function insertLearnedKnowledge(
  db: Db,
  input: {
    workspaceId: string;
    kind: 'alias' | 'enum_synonym';
    objectApiName: string;
    recordId?: string;
    variant?: string;
    fieldApiName?: string;
    synonym?: string;
    canonicalOption?: string;
    rationale?: string;
    sourceMessageId?: string;
  },
): Promise<LearnedKnowledgeRow> {
  const { data, error } = await db
    .from('learned_knowledge')
    .insert({
      workspace_id: input.workspaceId,
      kind: input.kind,
      object_api_name: input.objectApiName,
      record_id: input.recordId ?? null,
      variant: input.variant ?? null,
      field_api_name: input.fieldApiName ?? null,
      synonym: input.synonym ?? null,
      canonical_option: input.canonicalOption ?? null,
      rationale: input.rationale ?? null,
      source_message_id: input.sourceMessageId ?? null,
      status: 'pending',
    })
    .select('*')
    .single();
  return must(data as LearnedKnowledgeRow | null, error, 'insertLearnedKnowledge');
}

export async function listLearnedKnowledge(
  db: Db,
  workspaceId: string,
  status?: LearnedStatus,
): Promise<LearnedKnowledgeRow[]> {
  let query = db
    .from('learned_knowledge')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(`listLearnedKnowledge: ${error.message}`);
  return (data as LearnedKnowledgeRow[] | null) ?? [];
}

export async function getLearnedKnowledge(
  db: Db,
  workspaceId: string,
  learningId: string,
): Promise<LearnedKnowledgeRow | null> {
  const { data, error } = await db
    .from('learned_knowledge')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', learningId)
    .maybeSingle();
  if (error) throw new Error(`getLearnedKnowledge: ${error.message}`);
  return (data as LearnedKnowledgeRow | null) ?? null;
}

export async function setLearnedDecision(
  db: Db,
  input: {
    workspaceId: string;
    learningId: string;
    status: 'approved' | 'rejected';
    decidedBy: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from('learned_knowledge')
    .update({
      status: input.status,
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
    })
    .eq('workspace_id', input.workspaceId)
    .eq('id', input.learningId)
    .eq('status', 'pending');
  if (error) throw new Error(`setLearnedDecision: ${error.message}`);
}

/**
 * Assemble the approved rows into the render layer's LearnedView shape. Alias
 * rows join their bound record; a missing or archived record yields
 * record: null, which renders nothing (the FK cascade usually removes the row
 * first, but archive is soft). The output order does not matter: the renderer
 * sorts rendered lines for byte stability.
 */
export async function listApprovedLearnedViews(
  db: Db,
  workspaceId: string,
): Promise<LearnedView[]> {
  const rows = await listLearnedKnowledge(db, workspaceId, 'approved');
  const views: LearnedView[] = [];
  for (const row of rows) {
    if (row.kind === 'alias') {
      if (!row.record_id || !row.variant) continue;
      const record = await getRecord(db, workspaceId, row.record_id);
      views.push({
        kind: 'alias',
        objectApiName: row.object_api_name,
        variant: row.variant,
        record: record && !record.archived_at ? { data: record.data } : null,
      });
    } else {
      if (!row.field_api_name || !row.synonym || !row.canonical_option) continue;
      views.push({
        kind: 'enum_synonym',
        objectApiName: row.object_api_name,
        fieldApiName: row.field_api_name,
        synonym: row.synonym,
        canonicalOption: row.canonical_option,
      });
    }
  }
  return views;
}
