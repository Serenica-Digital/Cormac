import type { ContractField, ContractObject } from '@cormac/contract';
import type { ParsedSheet } from './types';

/**
 * Turn a parsed sheet into create-changes against a contract object, entirely
 * client-side (ADR-0014, control-register row 26: only the mapped values leave
 * the browser). Mapping is column-index -> field; coercion follows the field
 * type; the control plane re-validates on commit, so this only needs to produce
 * plausible values and skip what it can't.
 */

export type Mapping = Record<string, number | null>; // field apiName -> sheet column index

export interface SheetColumn {
  index: number;
  header: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function sheetColumns(sheet: ParsedSheet): SheetColumn[] {
  const header = sheet.grid[sheet.headerRowIndex] ?? [];
  return header.map((h, index) => ({ index, header: h.trim() || `Column ${index + 1}` }));
}

export function dataRows(sheet: ParsedSheet): string[][] {
  return sheet.grid.slice(sheet.headerRowIndex + 1);
}

/** Auto-match each field to a column by its excelColumn hint, label, or apiName. */
export function autoMap(object: ContractObject, columns: SheetColumn[]): Mapping {
  const byNorm = new Map<string, number>();
  for (const c of columns) if (!byNorm.has(norm(c.header))) byNorm.set(norm(c.header), c.index);

  const mapping: Mapping = {};
  for (const f of object.fields) {
    const candidates = [f.excelColumn, f.label, f.apiName].filter(Boolean).map((s) => norm(s!));
    const hit = candidates.map((c) => byNorm.get(c)).find((i) => i !== undefined);
    mapping[f.apiName] = hit ?? null;
  }
  return mapping;
}

/** Coerce a raw cell string to the field's type. Returns undefined to omit the field. */
export function coerceValue(field: ContractField, raw: string): unknown {
  const v = raw.trim();
  if (v === '') return undefined;
  switch (field.type) {
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean': {
      const low = v.toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(low)) return true;
      if (['false', 'no', 'n', '0'].includes(low)) return false;
      return undefined;
    }
    case 'date': {
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
    }
    case 'datetime': {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    case 'enum':
      return (field.enumOptions ?? []).includes(v) ? v : undefined;
    case 'relationship':
      return undefined; // relationships need id resolution; deferred (MVP is create-only, scalar)
    default:
      return v; // string / text / email / phone: server validates format
  }
}

export interface RowValues {
  values: Record<string, unknown>;
}

/**
 * Build create-changes for every non-empty data row. Only maps `editableByUser`
 * fields (the server requires it); a row missing any required, user-editable
 * field is skipped and counted, so a whole batch is not failed by one bad row.
 */
export function buildCreateChanges(
  object: ContractObject,
  sheet: ParsedSheet,
  mapping: Mapping,
): { changes: { objectApiName: string; op: 'create'; values: Record<string, unknown> }[]; skipped: number } {
  const fieldsByName = new Map(object.fields.map((f) => [f.apiName, f] as const));
  const requiredUserFields = object.fields.filter((f) => f.required && f.editableByUser);
  const rows = dataRows(sheet);

  const changes: { objectApiName: string; op: 'create'; values: Record<string, unknown> }[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (row.every((c) => c.trim() === '')) continue; // blank row
    const values: Record<string, unknown> = {};
    for (const [apiName, colIndex] of Object.entries(mapping)) {
      if (colIndex === null) continue;
      const field = fieldsByName.get(apiName);
      if (!field || !field.editableByUser) continue;
      const coerced = coerceValue(field, row[colIndex] ?? '');
      if (coerced !== undefined) values[apiName] = coerced;
    }
    // A row must carry every required user-editable field, or the server rejects it.
    if (requiredUserFields.some((f) => values[f.apiName] === undefined)) {
      skipped += 1;
      continue;
    }
    if (Object.keys(values).length === 0) {
      skipped += 1;
      continue;
    }
    changes.push({ objectApiName: object.apiName, op: 'create', values });
  }

  return { changes, skipped };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
