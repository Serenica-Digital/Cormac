import { renderWorkspaceContext, type Contract, type LearnedView } from '@cormac/contract';
import type { Db } from '../db.js';
import { listApprovedLearnedViews } from '../repo.js';

/**
 * Compile a workspace's cached context prefix: the active contract plus the
 * workspace's APPROVED learned knowledge, rendered into one byte-stable block
 * (no timestamps, no UUIDs; the renderer sorts learned lines, so DB row order
 * never changes the bytes). The block changes only when a contract publishes
 * or a learning decision lands, and a change there is a deliberate cache
 * invalidation.
 *
 * Learned rows enter only through the propose_learning gate with a human
 * decision (the memory-off invariant's governed alternative); pending and
 * rejected rows never render.
 */
export function compileWorkspaceContext(contract: Contract, learned: LearnedView[] = []): string {
  return renderWorkspaceContext(contract, learned);
}

/** The common case: fetch the approved learned views, then compile. */
export async function compileWorkspaceContextFromDb(
  db: Db,
  workspaceId: string,
  contract: Contract,
): Promise<string> {
  const learned = await listApprovedLearnedViews(db, workspaceId);
  return compileWorkspaceContext(contract, learned);
}
