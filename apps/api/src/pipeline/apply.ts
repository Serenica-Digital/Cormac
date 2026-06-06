import type { Contract } from '@serenica/contract';
import { parseProposal, validateProposalAgainstContract } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';
import type { AppContext } from '../app.js';
import type { RequestContext } from '../types.js';
import {
  createRecord,
  getActiveContract,
  getProposal,
  getRecord,
  insertAuditEvent,
  setProposalDecision,
  updateRecordData,
} from '../repo.js';

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
 * The apply half of the spine (ADR-005, ADR-010). On approve, each change is
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

  const applied: AppliedChange[] = [];
  for (const change of proposal.changes) {
    if (change.op === 'update') {
      if (!change.recordId) throw ProblemError.unprocessable('Update change missing recordId');
      const existing = await getRecord(db, workspaceId, change.recordId);
      if (!existing) throw new ProblemError(422, 'record_missing', `Record ${change.recordId} not found`);
      const before = existing.data;
      const after: Record<string, unknown> = { ...before, ...change.values };
      const updated = await updateRecordData(db, {
        workspaceId,
        recordId: existing.id,
        data: after,
        actorId: userId,
      });
      await insertAuditEvent(db, {
        workspaceId,
        actorType: 'user',
        actorId: userId,
        action: 'record_updated',
        objectApiName: change.objectApiName,
        recordId: updated.id,
        before,
        after,
        sourceMessageId: proposalRow.source_message_id,
        proposalId,
      });
      applied.push({ op: 'update', objectApiName: change.objectApiName, recordId: updated.id });
    } else {
      const created = await createRecord(db, {
        workspaceId,
        objectApiName: change.objectApiName,
        contractVersionId: contractRow.id,
        data: { ...change.values },
        actorId: userId,
      });
      await insertAuditEvent(db, {
        workspaceId,
        actorType: 'user',
        actorId: userId,
        action: 'record_created',
        objectApiName: change.objectApiName,
        recordId: created.id,
        before: null,
        after: created.data,
        sourceMessageId: proposalRow.source_message_id,
        proposalId,
      });
      applied.push({ op: 'create', objectApiName: change.objectApiName, recordId: created.id });
    }
  }

  await setProposalDecision(db, { workspaceId, proposalId, status: 'applied', decidedBy: userId });
  return { status: 'applied', applied };
}
