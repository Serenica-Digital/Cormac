import type { ContractObject } from '@cormac/contract';
import type { BusinessRecordRow } from '../api/types';

/**
 * Row ordering for the Book's grid. Sorting is ours, not the grid library's,
 * so the grid stays a rendering concern (ADR-0014). With no header sort the
 * default order puts what needs the user first (the attention rank), then
 * freshest last-changed; missing values always sink to the bottom.
 */

export interface GridSort {
  /** Field apiName, or '__updated' for the updated_at column. */
  field: string;
  dir: 'asc' | 'desc';
}

/** The next state when a header is clicked: asc, then desc, then off. */
export function cycleSort(prev: GridSort | null, field: string): GridSort | null {
  if (prev?.field !== field) return { field, dir: 'asc' };
  return prev.dir === 'asc' ? { field, dir: 'desc' } : null;
}

const blank = (v: unknown) => v === null || v === undefined || v === '';

export function sortRows(
  rows: BusinessRecordRow[],
  {
    sort,
    object,
    titleById,
    attentionRank,
  }: {
    sort: GridSort | null;
    object?: ContractObject;
    /** Resolves relationship ids so those columns sort by name, not by id. */
    titleById?: ReadonlyMap<string, string>;
    /** recordId -> position in the attention list; drives the default order. */
    attentionRank?: ReadonlyMap<string, number>;
  },
): BusinessRecordRow[] {
  if (!sort) {
    return [...rows].sort((a, b) => {
      const ra = attentionRank?.get(a.id) ?? Infinity;
      const rb = attentionRank?.get(b.id) ?? Infinity;
      if (ra !== rb) return ra - rb;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    });
  }

  const field = object?.fields.find((f) => f.apiName === sort.field);
  const valueOf = (r: BusinessRecordRow): unknown => {
    if (sort.field === '__updated') return r.updated_at;
    const v = (r.data as Record<string, unknown>)[sort.field];
    if (field?.type === 'relationship' && typeof v === 'string') return titleById?.get(v) ?? v;
    return v;
  };

  const flip = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (blank(va) && blank(vb)) return 0;
    if (blank(va)) return 1; // missing sinks regardless of direction
    if (blank(vb)) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * flip;
    if (typeof va === 'boolean' && typeof vb === 'boolean')
      return (Number(va) - Number(vb)) * flip;
    return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * flip;
  });
}
