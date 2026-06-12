import type { Contract } from '@serenica/contract';
import { safeParseLearnedPayload, validateLearningAgainstContract } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';
import type { AppContext } from '../app.js';
import type { RequestContext } from '../types.js';
import { getActiveContract, getLearnedKnowledge, getRecord } from '../repo.js';

export type LearningDecision = 'approve' | 'reject';

export interface LearningDecisionResult {
  id: string;
  status: string;
}

/**
 * The human gate over learned knowledge (ADR-027 section 4). Approve activates a
 * proposed item; reject closes it. The status flip and its audit event are one
 * transaction in decide_learning; this function owns validation only, and
 * re-validates on approve in case the contract changed since the agent proposed
 * (the same guard decideProposal applies). Authorization happened in the route.
 */
export async function decideLearning(
  app: AppContext,
  ctx: RequestContext,
  learnedId: string,
  decision: LearningDecision,
): Promise<LearningDecisionResult> {
  const { db } = app;
  const { workspaceId, userId } = ctx;

  const row = await getLearnedKnowledge(db, workspaceId, learnedId);
  if (!row) throw ProblemError.notFound('Learned item not found');
  if (row.status !== 'proposed') {
    throw ProblemError.badRequest(`Learned item already ${row.status}`);
  }

  if (decision === 'approve') {
    const contractRow = await getActiveContract(db, workspaceId);
    if (!contractRow) throw ProblemError.unprocessable('This workspace has no active contract');
    const contract = contractRow.document as Contract;

    const parsed = safeParseLearnedPayload(row.kind, row.payload);
    if (!parsed.success) {
      throw new ProblemError(
        422,
        'learning_invalid',
        'Learned item no longer parses and was not activated',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }
    const validation = validateLearningAgainstContract(contract, row.kind, parsed.data);
    if (!validation.ok) {
      throw new ProblemError(
        422,
        'learning_invalid',
        'Learned item is no longer valid against the active contract',
        validation.errors.join('; '),
      );
    }
    if (row.kind === 'alias') {
      const record = row.record_id ? await getRecord(db, workspaceId, row.record_id) : null;
      if (!record || record.archived_at) {
        throw new ProblemError(
          422,
          'learning_invalid',
          'The aliased record no longer exists and the alias was not activated',
        );
      }
    }
    return decideRpc(app, workspaceId, learnedId, userId, 'activate');
  }

  return decideRpc(app, workspaceId, learnedId, userId, 'reject');
}

/**
 * Revoke an already-active learned item (ADR-027 section 4: the same trust level
 * as approving a proposal). Revocation reopens the dedup slot, so the same fact
 * can be re-proposed later.
 */
export async function revokeLearning(
  app: AppContext,
  ctx: RequestContext,
  learnedId: string,
): Promise<LearningDecisionResult> {
  const { db } = app;
  const { workspaceId, userId } = ctx;

  const row = await getLearnedKnowledge(db, workspaceId, learnedId);
  if (!row) throw ProblemError.notFound('Learned item not found');
  if (row.status !== 'active') {
    throw ProblemError.badRequest(`Learned item is ${row.status}, not active`);
  }
  return decideRpc(app, workspaceId, learnedId, userId, 'revoke');
}

async function decideRpc(
  app: AppContext,
  workspaceId: string,
  learnedId: string,
  actorId: string | null,
  action: 'activate' | 'reject' | 'revoke',
): Promise<LearningDecisionResult> {
  const { data, error } = await app.db.rpc('decide_learning', {
    p_workspace_id: workspaceId,
    p_learned_id: learnedId,
    p_actor_id: actorId,
    p_action: action,
  });
  if (error) {
    const status = error.code === 'P0002' ? 422 : 500;
    throw new ProblemError(
      status,
      'learning_decision_failed',
      'The learning decision failed; nothing changed',
      error.message,
    );
  }
  return data as LearningDecisionResult;
}
