import type { Contract } from '@serenica/contract';
import { validateProposalAgainstContract } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';
import type { AppContext } from '../app.js';
import { callRuntime } from '../adapter/runtime.js';
import type { RequestContext } from '../types.js';
import {
  getActiveContract,
  insertProposal,
  insertSourceMessage,
  listRecordSummaries,
} from '../repo.js';

export interface CaptureResult {
  proposalId: string;
  sourceMessageId: string;
  status: string;
  uncertain: boolean;
  changeCount: number;
}

/**
 * The capture half of the spine (ADR-005, ADR-007). One inbound message becomes
 * a source_message, then the runtime proposes, then the proposal is validated
 * against the active contract and HELD as pending (confirm-each, ADR-010).
 * Nothing is written to business records here.
 */
export async function captureUpdate(
  app: AppContext,
  ctx: RequestContext,
  text: string,
): Promise<CaptureResult> {
  const { db, config } = app;
  const { workspaceId, userId } = ctx;

  const contractRow = await getActiveContract(db, workspaceId);
  if (!contractRow) {
    throw ProblemError.unprocessable('This workspace has no active contract yet');
  }
  const contract = contractRow.document as Contract;

  // Provenance first: the source message exists even if the proposal is rejected.
  const sourceMessageId = await insertSourceMessage(db, {
    workspaceId,
    channel: 'web',
    userId,
    content: text,
  });

  const records = await listRecordSummaries(db, workspaceId, contract);

  // Shape-validated by the adapter; untrusted until checked against the contract.
  const proposal = await callRuntime(config.RUNTIME_URL, { workspaceId, contract, text, records });

  const validation = validateProposalAgainstContract(contract, proposal);
  if (!validation.ok) {
    throw new ProblemError(
      422,
      'proposal_invalid',
      'The agent proposal violated the contract and was not held',
      validation.errors.join('; '),
    );
  }

  const proposalRow = await insertProposal(db, {
    workspaceId,
    sourceMessageId,
    payload: proposal,
    createdBy: userId,
  });

  return {
    proposalId: proposalRow.id,
    sourceMessageId,
    status: proposalRow.status,
    uncertain: proposal.uncertain,
    changeCount: proposal.changes.length,
  };
}
