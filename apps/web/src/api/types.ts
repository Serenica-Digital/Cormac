/**
 * Mirrors of the control plane's human-surface response shapes
 * (apps/control-plane/src/routes/human.ts and pipeline/queries.ts). The server
 * owns these; this file just names them for the client.
 */

export interface WorkspaceMembership {
  id: string;
  name: string;
  role: string;
}

export interface Me {
  userId: string;
  email: string | null;
  platformAdmin: boolean;
}

export interface WorkspaceMemberRow {
  userId: string;
  email: string | null;
  role: string;
  createdAt: string;
}

export interface AddMemberResult {
  member: WorkspaceMemberRow;
  userCreated: boolean;
}

// --- Operator surface (routes/operator.ts) ---------------------------------

export interface OperatorWorkspaceStats {
  memberCount: number;
  contractVersion: number | null;
  recordCount: number;
  pendingProposalCount: number;
  lastAuditAt: string | null;
}

export interface OperatorWorkspaceSummary {
  id: string;
  name: string;
  createdAt: string;
  stats: OperatorWorkspaceStats;
}

export interface OperatorAgentToken {
  id: string;
  workspaceId: string;
  agent: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface OperatorWorkspaceDetail {
  workspace: { id: string; name: string; confirmationMode: string; createdAt: string };
  stats: OperatorWorkspaceStats;
  members: WorkspaceMemberRow[];
  agentTokens: OperatorAgentToken[];
  contract: { version: number; document: unknown } | null;
}

export interface CreateWorkspaceResult {
  workspace: { id: string; name: string; createdAt: string };
  owner: { userId: string; email: string; userCreated: boolean } | null;
}

export interface ProposalChangeView {
  objectApiName: string;
  op: 'create' | 'update';
  recordId: string | null;
  values: Record<string, unknown>;
  current: Record<string, unknown> | null;
}

export interface ProposalView {
  id: string;
  status: 'pending' | 'applied' | 'rejected' | string;
  createdAt: string;
  sourceMessageId: string;
  uncertain: boolean;
  notes?: string;
  changes: ProposalChangeView[];
}

export interface CaptureResult {
  proposalId: string | null;
  sourceMessageId: string;
  status: 'pending' | 'no_proposal';
  uncertain: boolean;
  changeCount: number;
  agentNote?: string;
}

export interface DecisionResult {
  status: 'applied' | 'rejected';
  applied: Array<{ op: 'create' | 'update'; objectApiName: string; recordId: string }>;
}

export interface CommitResult {
  proposalId: string;
  applied: Array<{ op: 'create' | 'update'; objectApiName: string; recordId: string }>;
}

export interface BusinessRecordRow {
  id: string;
  workspace_id: string;
  object_api_name: string;
  contract_version_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TimelineEntry {
  id: string;
  at: string;
  actorType: 'user' | 'agent';
  action: string;
  utterance: string | null;
  channel: string | null;
  proposalId: string | null;
  proposalStatus: string | null;
  /** Human-authored change (grid edit, import): the source is provenance, not speech. */
  direct?: boolean;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditEventRow {
  id: string;
  actor_type: 'user' | 'agent';
  actor_id: string | null;
  action: string;
  object_api_name: string | null;
  record_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  source_message_id: string | null;
  proposal_id: string | null;
  created_at: string;
}

export interface AuthoringTurnOutcome {
  conversation: string;
  output: string;
}

export interface WorkbookUploadResult {
  snapshotId: string;
  name: string;
  createdAt: string;
}
