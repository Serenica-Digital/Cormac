import type { Contract } from '@serenica/contract';
import { safeParseProposal, validateProposalAgainstContract } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';
import type { AppContext } from '../app.js';
import { callStubRuntime, runHermesTask } from '../adapter/runtime.js';
import { compileWorkspaceContext } from './context.js';
import type { RequestContext } from '../types.js';
import {
  getActiveContract,
  getProposalBySourceMessage,
  insertProposal,
  insertSourceMessage,
  listRecordSummaries,
  recordRunOutcome,
} from '../repo.js';

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
 * The capture half of the spine (ADR-005, ADR-007). One inbound message becomes
 * a source_message, then the runtime works the task, then a proposal is HELD as
 * pending (confirm-each, ADR-010). Nothing is written to business records here.
 *
 * On the Hermes path the agent retrieves context through its MCP tools and
 * submits through `submit_proposal`, which validates against the contract and
 * holds the proposal before the run ends (ADR-025). Capture therefore does not
 * parse agent output; it waits for the run and correlates the held proposal by
 * source message. The stub path keeps the old synchronous shape for tests:
 * proposal in the response body, validated and inserted here.
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

  // Provenance first: the source message exists even if no proposal follows.
  const sourceMessageId = await insertSourceMessage(db, {
    workspaceId,
    channel: 'web',
    userId,
    content: text,
  });

  if (config.RUNTIME_KIND === 'stub') {
    return captureViaStub(app, ctx, contract, sourceMessageId, text);
  }

  // Compile the workspace context once per capture and deliver it as the run's
  // cached prefix, so the agent does not fetch the contract per run (ADR-027).
  const context = await compileWorkspaceContext(app, workspaceId, contract);

  const outcome = await runHermesTask(
    {
      url: config.RUNTIME_URL,
      apiKey: config.RUNTIME_API_KEY,
      timeoutMs: config.RUNTIME_TIMEOUT_MS,
    },
    { taskId: sourceMessageId, text, context },
  );

  // Telemetry survives the session the adapter just deleted (#39). Persisted
  // whatever the proposal outcome; a decline still cost tokens.
  await recordRunOutcome(db, {
    workspaceId,
    sourceMessageId,
    runId: outcome.runId,
    usage: outcome.usage,
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

  // Already validated and held by the submit_proposal tool; parse only to report.
  const payload = safeParseProposal(proposalRow.payload);
  return {
    proposalId: proposalRow.id,
    sourceMessageId,
    status: proposalRow.status,
    uncertain: payload.success ? payload.data.uncertain : false,
    changeCount: payload.success ? payload.data.changes.length : 0,
  };
}

async function captureViaStub(
  app: AppContext,
  ctx: RequestContext,
  contract: Contract,
  sourceMessageId: string,
  text: string,
): Promise<CaptureResult> {
  const { db, config } = app;
  const { workspaceId, userId } = ctx;

  const records = await listRecordSummaries(db, workspaceId, contract);

  // Shape-validated by the adapter; untrusted until checked against the contract.
  const proposal = await callStubRuntime(config.RUNTIME_URL, {
    workspaceId,
    contract,
    text,
    records,
  });

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
