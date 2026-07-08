import { renderWorkspaceContext, type Contract } from '@cormac/contract';

/**
 * Compile a workspace's cached context prefix: the active contract rendered
 * into one byte-stable block (nothing here adds a timestamp or a UUID, so the
 * block stays cache-identical between publishes). v0 joined active learned
 * knowledge in here; governed learning is deferred to #35, so the learned list
 * is empty by construction until then.
 */
export function compileWorkspaceContext(contract: Contract): string {
  return renderWorkspaceContext(contract, []);
}
