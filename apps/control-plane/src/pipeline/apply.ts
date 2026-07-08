import type { Contract } from '@cormac/contract';
import { parseProposal, validateProposalAgainstContract } from '@cormac/contract';
import { ProblemError } from '../shared.js';
import type { AppContext } from '../app.js';
import type { RequestContext } from '../types.js';
import { getActiveContract, getProposal, insertAuditEvent, setProposalDecision } from '../repo.js';

export type Decision = 'approve' | 'reject';

export interface AppliedChange {
  op: 'create' | 'update';
  objectApiName: string;
  recordId: string;
}

export interface DecisionResult {
  status: 'applied' | 'rejected';
  applied: AppliedChange[];
}

/**
 * The apply half of the spine (ported from v0). On approve, each change is
 * written through the service client and an audit_event with before/after and a
 * source link is recorded. On reject, the proposal is closed with an audit
 * trail and nothing is written. The proposal is re-validated against the active
 * contract first, in case the contract changed since capture.
 */
export async function decideProposal(
  app: AppContext,
  ctx: RequestContext,
  proposalId: string,
  decision: Decision,
): Promise<DecisionResult> {
  const { db } = app;
  const { workspaceId, userId } = ctx;

  const proposalRow = await getProposal(db, workspaceId, proposalId);
  if (!proposalRow) throw ProblemError.notFound('Proposal not found');
  if (proposalRow.status !== 'pending') {
    throw ProblemError.badRequest(`Proposal already ${proposalRow.status}`);
  }

  if (decision === 'reject') {
    await setProposalDecision(db, { workspaceId, proposalId, status: 'rejected', decidedBy: userId });
    await insertAuditEvent(db, {
      workspaceId,
      actorType: 'user',
      actorId: userId,
      action: 'proposal_rejected',
      objectApiName: null,
      recordId: null,
      before: null,
      after: null,
      sourceMessageId: proposalRow.source_message_id,
      proposalId,
    });
    return { status: 'rejected', applied: [] };
  }

  const contractRow = await getActiveContract(db, workspaceId);
  if (!contractRow) throw ProblemError.unprocessable('This workspace has no active contract');
  const contract = contractRow.document as Contract;

  const proposal = parseProposal(proposalRow.payload);
  const validation = validateProposalAgainstContract(contract, proposal);
  if (!validation.ok) {
    throw new ProblemError(
      422,
      'proposal_invalid',
      'Proposal is no longer valid against the active contract',
      validation.errors.join('; '),
    );
  }

  // Apply atomically in the database. The record writes, the audit events, and
  // the proposal status flip are one transaction: they all land, or a failure
  // rolls back every one of them. Authorization already happened above (token,
  // membership, role); the function only executes the already-validated writes
  // for this already-authorized workspace, and EXECUTE on it is granted to the
  // service role only.
  const { data, error } = await db.rpc('apply_proposal', {
    p_workspace_id: workspaceId,
    p_proposal_id: proposalId,
    p_actor_id: userId,
    p_contract_version_id: contractRow.id,
    p_changes: proposal.changes,
  });
  if (error) {
    const status = error.code === 'P0002' ? 422 : 500;
    throw new ProblemError(
      status,
      'apply_failed',
      'Applying the proposal failed; nothing was written',
      error.message,
    );
  }
  return { status: 'applied', applied: (data as AppliedChange[]) ?? [] };
}
