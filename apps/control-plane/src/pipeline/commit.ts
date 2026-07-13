import type { Contract, Proposal } from '@cormac/contract';
import { safeParseProposal, validateProposalAgainstContract } from '@cormac/contract';
import { ProblemError } from '../shared.js';
import type { AppContext } from '../app.js';
import type { RequestContext } from '../types.js';
import type { SourceChannel } from '../rows.js';
import {
  getActiveContract,
  insertProposal,
  insertSourceMessage,
  setProposalDecision,
} from '../repo.js';
import type { AppliedChange } from './apply.js';

export interface CommitResult {
  proposalId: string;
  applied: AppliedChange[];
}

/**
 * The human write path (ADR-0014). A batch of structured changes the user
 * authored directly — grid cell edits or a workbook import — becomes an
 * applied, audited proposal. Unlike capture, the user IS the confirmer: their
 * Save (or import confirm) is the confirmation, so this creates the proposal and
 * applies it in one request instead of holding it for the Inbox.
 *
 * It never writes to business records itself; `apply_proposal` (the one writer)
 * does, atomically. The boundary that makes this safe is authority: the route
 * requires the `edit_records` capability, and validation here uses human
 * editability (`editableByUser`), not the agent's. `created_by = userId` marks
 * the proposal as a human direct edit (agent proposals carry a null creator).
 */
export async function commitHumanChanges(
  app: AppContext,
  ctx: RequestContext,
  input: { changes: unknown[]; channel: SourceChannel; note?: string },
): Promise<CommitResult> {
  const { db } = app;
  const { workspaceId, userId } = ctx;

  const contractRow = await getActiveContract(db, workspaceId);
  if (!contractRow) throw ProblemError.unprocessable('This workspace has no active contract');
  const contract = contractRow.document as Contract;

  // Shape-parse the batch as a proposal, then validate against the contract as a
  // HUMAN write (editableByUser), before anything is inserted.
  const parsed = safeParseProposal({
    changes: input.changes,
    notes: input.note,
    uncertain: false,
  });
  if (!parsed.success) {
    throw new ProblemError(
      400,
      'invalid_changes',
      'The change batch is malformed',
      parsed.error.message,
    );
  }
  const proposal = parsed.data;
  const validation = validateProposalAgainstContract(contract, proposal, { editableBy: 'user' });
  if (!validation.ok) {
    throw new ProblemError(
      422,
      'changes_invalid',
      'Changes are not valid against the active contract',
      validation.errors.join('; '),
    );
  }

  // Provenance: a source message (channel distinguishes a grid edit from an
  // import) plus a user-authored proposal.
  const sourceMessageId = await insertSourceMessage(db, {
    workspaceId,
    channel: input.channel,
    userId,
    content: input.note ?? defaultNote(proposal),
  });
  const proposalRow = await insertProposal(db, {
    workspaceId,
    sourceMessageId,
    payload: proposal,
    createdBy: userId,
  });

  // Apply atomically. On failure, close the just-created proposal as rejected so
  // it does not linger as pending noise in the review queue, then surface it.
  const { data, error } = await db.rpc('apply_proposal', {
    p_workspace_id: workspaceId,
    p_proposal_id: proposalRow.id,
    p_actor_id: userId,
    p_contract_version_id: contractRow.id,
    p_changes: proposal.changes,
  });
  if (error) {
    await setProposalDecision(db, {
      workspaceId,
      proposalId: proposalRow.id,
      status: 'rejected',
      decidedBy: userId,
    });
    const status = error.code === 'P0002' ? 422 : 500;
    throw new ProblemError(
      status,
      'apply_failed',
      'Applying the changes failed; nothing was written',
      error.message,
    );
  }

  return { proposalId: proposalRow.id, applied: (data as AppliedChange[]) ?? [] };
}

/** A human-readable provenance line for the record timeline when the caller gives none. */
function defaultNote(proposal: Proposal): string {
  const n = proposal.changes.length;
  const ops = new Set(proposal.changes.map((c) => c.op));
  const verb = ops.size === 1 ? [...ops][0] : 'change';
  return `Direct ${verb}: ${n} record${n === 1 ? '' : 's'}`;
}
