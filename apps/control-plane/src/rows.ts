import type { Contract } from '@cormac/contract';
import type { AgentKind, ConfirmationMode, Role } from './shared.js';

/**
 * Row shapes for the app-owned operational tables (contract-first invariant:
 * these are the only fixed tables; business objects are contract-defined data
 * living in business_records). Hand-written for the skeleton, inlined from
 * v0's @cormac/db types.
 */

export type ProposalStatus = 'pending' | 'applied' | 'rejected';
export type SourceChannel = 'web' | 'sms' | 'email' | 'excel' | 'mcp';

export interface WorkspaceRow {
  id: string;
  name: string;
  confirmation_mode: ConfirmationMode;
  created_at: string;
}

export interface MembershipRow {
  workspace_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export interface ContractVersionRow {
  id: string;
  workspace_id: string;
  version: number;
  document: Contract;
  is_active: boolean;
  published_by: string | null;
  created_at: string;
}

export interface BusinessRecordRow {
  id: string;
  workspace_id: string;
  object_api_name: string;
  contract_version_id: string;
  data: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface SourceMessageRow {
  id: string;
  workspace_id: string;
  channel: SourceChannel;
  sender: string | null;
  user_id: string | null;
  content: string;
  created_at: string;
}

export interface ProposalRow {
  id: string;
  workspace_id: string;
  source_message_id: string;
  status: ProposalStatus;
  payload: unknown;
  created_by: string | null;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

export interface AuditEventRow {
  id: string;
  workspace_id: string;
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

export interface WorkbookSnapshotRow {
  id: string;
  workspace_id: string;
  name: string;
  profile: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface AgentTokenRow {
  id: string;
  workspace_id: string;
  agent: AgentKind;
  token_hash: string;
  created_at: string;
  revoked_at: string | null;
}
