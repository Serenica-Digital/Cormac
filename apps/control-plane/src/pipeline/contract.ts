import type { Contract } from '@cormac/contract';
import { ProblemError } from '../shared.js';
import type { AppContext } from '../app.js';

export interface PublishResult {
  contract_version_id: string;
  version: number;
}

/**
 * Publish a new contract version: the one gate that changes a workspace's
 * governed definition, schema plus glossary (ported from v0). The contract has
 * already been parsed and validated by the caller; publish_contract assigns
 * the server-authoritative version, flips the active version, and writes the
 * audit event in one transaction. Authorization happened in the route (the
 * publish_contract capability for humans, the submit_contract agent capability
 * on the /agent surface), and EXECUTE on the function is service-role only.
 */
export async function publishContract(
  app: AppContext,
  input: { workspaceId: string; actorId: string | null },
  contract: Contract,
): Promise<PublishResult> {
  const { data, error } = await app.db.rpc('publish_contract', {
    p_workspace_id: input.workspaceId,
    p_document: contract,
    p_actor_id: input.actorId,
  });
  if (error) {
    const status = error.code === 'P0002' ? 404 : 500;
    throw new ProblemError(
      status,
      'publish_failed',
      'Publishing the contract failed; nothing changed',
      error.message,
    );
  }
  return data as PublishResult;
}
