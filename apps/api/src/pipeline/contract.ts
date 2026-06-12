import type { Contract } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';
import type { AppContext } from '../app.js';
import type { RequestContext } from '../types.js';

export interface PublishResult {
  contract_version_id: string;
  version: number;
}

/**
 * Publish a new contract version: the one gate that changes a workspace's
 * governed definition, schema plus glossary (ADR-002, ADR-027 section 2). The
 * contract has already been parsed and validated by the route; publish_contract
 * assigns the server-authoritative version, flips the active version, and writes
 * the audit event in one transaction. Authorization happened in the route
 * (publish_contract capability), and EXECUTE on the function is service-role
 * only.
 */
export async function publishContract(
  app: AppContext,
  ctx: RequestContext,
  contract: Contract,
): Promise<PublishResult> {
  const { data, error } = await app.db.rpc('publish_contract', {
    p_workspace_id: ctx.workspaceId,
    p_document: contract,
    p_actor_id: ctx.userId,
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
