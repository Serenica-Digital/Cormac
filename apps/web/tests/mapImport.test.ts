import { describe, expect, it } from 'vitest';
import { parseContract } from '@cormac/contract';
import type { ParsedSheet } from '@/workbook/types';
import { autoMap, buildCreateChanges, coerceValue, sheetColumns } from '@/workbook/mapImport';

/**
 * Correctness of the in-browser workbook -> records mapping (ADR-0014, #98). The
 * enforced write gate is the control plane (control-register row 27) and the
 * "only mapped values leave the browser" boundary is row 26; this proves the
 * client produces valid, correctly-coerced create changes and skips what it must.
 */
const object = parseContract({
  name: 't',
  version: 1,
  objects: [
    {
      objectId: 'obj_contact',
      apiName: 'contact',
      label: 'Contact',
      identity: { displayFields: ['full_name'] },
      fields: [
        { fieldId: 'f1', apiName: 'full_name', label: 'Full name', type: 'string', required: true, editableByUser: true, editableByAgent: true },
        { fieldId: 'f2', apiName: 'deals', label: 'Deals', type: 'number', editableByUser: true, editableByAgent: true },
        { fieldId: 'f3', apiName: 'status', label: 'Status', type: 'enum', enumOptions: ['lead', 'active'], editableByUser: true, editableByAgent: true },
        { fieldId: 'f4', apiName: 'last_contact', label: 'Last contact', type: 'date', editableByUser: true, editableByAgent: true },
        { fieldId: 'f5', apiName: 'vip', label: 'VIP', type: 'boolean', editableByUser: true, editableByAgent: true },
        { fieldId: 'f6', apiName: 'system_id', label: 'System id', type: 'string', editableByUser: false, editableByAgent: false },
      ],
    },
  ],
}).objects[0]!;

const field = (apiName: string) => object.fields.find((f) => f.apiName === apiName)!;

const sheet: ParsedSheet = {
  name: 'Sheet1',
  headerRowIndex: 0,
  grid: [
    ['Full name', 'Deals', 'Status', 'Junk'],
    ['Alice', '3', 'lead', 'x'],
    ['Bob', 'notanumber', 'active', ''],
    ['', '', '', ''], // blank row
    ['', '5', 'lead', 'y'], // missing the required full_name
  ],
};

describe('coerceValue', () => {
  it('coerces by field type and omits empty or invalid values', () => {
    expect(coerceValue(field('deals'), '3')).toBe(3);
    expect(coerceValue(field('deals'), 'notanumber')).toBeUndefined();
    expect(coerceValue(field('deals'), '')).toBeUndefined();
    expect(coerceValue(field('status'), 'lead')).toBe('lead');
    expect(coerceValue(field('status'), 'nope')).toBeUndefined();
    expect(coerceValue(field('last_contact'), '2026-01-02')).toBe('2026-01-02');
    expect(coerceValue(field('last_contact'), 'bad')).toBeUndefined();
    expect(coerceValue(field('vip'), 'yes')).toBe(true);
    expect(coerceValue(field('vip'), 'no')).toBe(false);
    expect(coerceValue(field('vip'), 'maybe')).toBeUndefined();
    expect(coerceValue(field('full_name'), 'Alice')).toBe('Alice');
    expect(coerceValue(field('full_name'), '   ')).toBeUndefined();
  });
});

describe('autoMap', () => {
  it('matches columns to fields by header, and leaves unmatched fields null', () => {
    const cols = sheetColumns(sheet);
    const mapping = autoMap(object, cols);
    expect(mapping.full_name).toBe(0);
    expect(mapping.deals).toBe(1);
    expect(mapping.status).toBe(2);
    expect(mapping.last_contact).toBeNull();
    expect(mapping.system_id).toBeNull();
  });
});

describe('buildCreateChanges', () => {
  it('builds create changes, coerces values, and skips rows missing a required field', () => {
    const mapping = autoMap(object, sheetColumns(sheet));
    const { changes, skipped } = buildCreateChanges(object, sheet, mapping);

    expect(changes).toHaveLength(2);
    expect(changes[0]!.values).toEqual({ full_name: 'Alice', deals: 3, status: 'lead' });
    // Bob's "notanumber" is dropped; the rest imports.
    expect(changes[1]!.values).toEqual({ full_name: 'Bob', status: 'active' });
    expect(changes.every((c) => c.op === 'create' && c.objectApiName === 'contact')).toBe(true);
    // The blank row is ignored; the row missing full_name is counted as skipped.
    expect(skipped).toBe(1);
  });

  it('never maps a field that is not user-editable', () => {
    const mapping = { full_name: 0, system_id: 3 };
    const { changes } = buildCreateChanges(object, sheet, mapping);
    expect(changes.every((c) => !('system_id' in c.values))).toBe(true);
  });
});
