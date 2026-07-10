import type { Contract } from '@cormac/contract';
import { safeParseProposal } from '@cormac/contract';
import { ProblemError } from '../shared.js';
import type { AppContext } from '../app.js';
import type { RequestContext } from '../types.js';
import { compileWorkspaceContext } from './context.js';
import { getActiveContract, getProposalBySourceMessage, insertSourceMessage } from '../repo.js';

export interface CaptureResult {
  /** Null when the agent finished without submitting a proposal. */
  proposalId: string | null;
  sourceMessageId: string;
  /** A proposal status (normally `pending`), or `no_proposal`. */
  status: string;
  uncertain: boolean;
  changeCount: number;
  /** The agent's final text when it declined or asked instead of proposing. */
  agentNote?: string;
}

/**
 * The capture half of the spine (ported from v0, minus the stub-runtime
 * branch: tests inject a fake RuntimeClient that calls the real /agent
 * endpoints instead). One inbound message becomes a source_message, then the
 * runtime works the task, then a proposal is HELD as pending (confirm-each).
 * Nothing is written to business records here.
 *
 * The agent submits through the /agent/proposals gate, which validates against
 * the contract and holds the proposal before the run ends. Capture therefore
 * does not parse agent output; it waits for the run and correlates the held
 * proposal by source message.
 */
export async function captureUpdate(
  app: AppContext,
  ctx: RequestContext,
  text: string,
): Promise<CaptureResult> {
  const { db } = app;
  const runtime = app.runtimes.operations;
  const { workspaceId, userId } = ctx;

  if (!runtime) {
    throw new ProblemError(
      503,
      'runtime_unavailable',
      'The operations agent runtime is not configured',
    );
  }

  const contractRow = await getActiveContract(db, workspaceId);
  if (!contractRow) {
    throw ProblemError.unprocessable('This workspace has no active contract yet');
  }
  const contract = contractRow.document as Contract;

  // Provenance first: the source message exists even if no proposal follows.
  const sourceMessageId = await insertSourceMessage(db, {
    workspaceId,
    channel: 'web',
    userId,
    content: text,
  });

  // Compile the workspace context once per capture and deliver it as the run's
  // cached prefix, so the agent does not fetch the contract per run.
  const context = compileWorkspaceContext(contract);

  const outcome = await runtime.runCaptureTask({
    taskId: sourceMessageId,
    workspaceId,
    text,
    context,
  });

  const proposalRow = await getProposalBySourceMessage(db, workspaceId, sourceMessageId);
  if (!proposalRow) {
    return {
      proposalId: null,
      sourceMessageId,
      status: 'no_proposal',
      uncertain: false,
      changeCount: 0,
      agentNote: outcome.output.slice(0, 2000),
    };
  }

  // Already validated and held by the /agent/proposals gate; parse only to report.
  const payload = safeParseProposal(proposalRow.payload);
  return {
    proposalId: proposalRow.id,
    sourceMessageId,
    status: proposalRow.status,
    uncertain: payload.success ? payload.data.uncertain : false,
    changeCount: payload.success ? payload.data.changes.length : 0,
  };
}
