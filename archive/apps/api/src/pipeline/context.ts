import {
  renderWorkspaceContext,
  safeParseLearnedPayload,
  type AliasPayload,
  type Contract,
  type EnumSynonymPayload,
  type LearnedView,
} from '@cormac/contract';
import type { AppContext } from '../app.js';
import { getRecord, listActiveLearnedKnowledge } from '../repo.js';

/**
 * Compile a workspace's cached context prefix (ADR-027 section 3): the active
 * contract plus its active learned knowledge, rendered into one byte-stable
 * block. This owns the row-to-view join the renderer needs: an active alias is
 * resolved to its current record (null when archived or gone, which renders
 * nothing), an enum synonym maps field-for-field. Nothing here adds a timestamp
 * or a UUID, so the block stays cache-identical between publishes.
 */
export async function compileWorkspaceContext(
  app: AppContext,
  workspaceId: string,
  contract: Contract,
): Promise<string> {
  const rows = await listActiveLearnedKnowledge(app.db, workspaceId);
  const learned: LearnedView[] = [];
  for (const row of rows) {
    const parsed = safeParseLearnedPayload(row.kind, row.payload);
    if (!parsed.success) continue; // an active row should always parse; skip if not
    if (row.kind === 'alias') {
      const p = parsed.data as AliasPayload;
      const record = row.record_id ? await getRecord(app.db, workspaceId, row.record_id) : null;
      learned.push({
        kind: 'alias',
        objectApiName: p.objectApiName,
        variant: p.variant,
        record: record && !record.archived_at ? { data: record.data } : null,
      });
    } else {
      const p = parsed.data as EnumSynonymPayload;
      learned.push({
        kind: 'enum_synonym',
        objectApiName: p.objectApiName,
        fieldApiName: p.fieldApiName,
        synonym: p.synonym,
        canonicalOption: p.canonicalOption,
      });
    }
  }
  return renderWorkspaceContext(contract, learned);
}
