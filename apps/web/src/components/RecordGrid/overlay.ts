import type { BusinessRecordRow, ProposalView } from '../../api/types';
import type { CellOverlay } from './RecordGrid';

/**
 * Project pending proposals onto the grid for one object: which cells carry a
 * pending change (the overlay), and synthetic "ghost" rows for proposed creates
 * that have no record yet. The join is the same one the review queue uses:
 * row = record with id === change.recordId; cell = field in change.values.
 */
export function buildOverlay(
  proposals: ProposalView[],
  objectApiName: string | undefined,
): {
  overlay: Map<string, Map<string, CellOverlay>>;
  ghostRows: BusinessRecordRow[];
  ghostIds: Set<string>;
} {
  const overlay = new Map<string, Map<string, CellOverlay>>();
  const ghostRows: BusinessRecordRow[] = [];
  const ghostIds = new Set<string>();
  if (!objectApiName) return { overlay, ghostRows, ghostIds };

  const put = (rowId: string, field: string, o: CellOverlay) => {
    let m = overlay.get(rowId);
    if (!m) {
      m = new Map();
      overlay.set(rowId, m);
    }
    m.set(field, o);
  };

  for (const p of proposals) {
    p.changes.forEach((ch, idx) => {
      if (ch.objectApiName !== objectApiName) return;
      if (ch.op === 'update' && ch.recordId) {
        for (const [field, proposed] of Object.entries(ch.values)) {
          put(ch.recordId, field, { current: ch.current?.[field], proposed, op: 'update' });
        }
      } else if (ch.op === 'create') {
        const ghostId = `ghost:${p.id}:${idx}`;
        ghostIds.add(ghostId);
        ghostRows.push({
          id: ghostId,
          workspace_id: '',
          object_api_name: objectApiName,
          contract_version_id: '',
          data: ch.values,
          created_at: p.createdAt,
          updated_at: p.createdAt,
          archived_at: null,
        });
        for (const [field, proposed] of Object.entries(ch.values)) {
          put(ghostId, field, { current: undefined, proposed, op: 'create' });
        }
      }
    });
  }
  return { overlay, ghostRows, ghostIds };
}
