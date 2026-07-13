import type { ContractField, ContractObject } from '@cormac/contract';

/**
 * Identity display fields first, then the rest. Unlike `tableColumns`, there is no
 * column cap: the governed grid scrolls, so it shows every field.
 */
export function orderedFields(object: ContractObject): ContractField[] {
  const identity = object.identity.displayFields;
  return [
    ...object.fields.filter((f) => identity.includes(f.apiName)),
    ...object.fields.filter((f) => !identity.includes(f.apiName)),
  ];
}

/** Map a contract field type to a LyteNyte column type (sort comparison, filter, alignment). */
export function gridColumnType(
  type: ContractField['type'],
): 'number' | 'date' | 'boolean' | undefined {
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'date' || type === 'datetime') return 'date';
  return undefined;
}

/**
 * Column sizing: flex weights so the columns fill the pane with no dead zone.
 * Identity leads and gets room; prose-ish fields absorb the most; compact
 * types stay compact. widthMin keeps a crowded book from crushing columns
 * into unreadability (the grid scrolls horizontally past that point).
 */
export function gridColumnSize(
  field: ContractField,
  isIdentity: boolean,
): { width: number; widthMin: number; widthFlex: number } {
  if (isIdentity) return { width: 220, widthMin: 180, widthFlex: 1.2 };
  if (field.type === 'text') return { width: 240, widthMin: 180, widthFlex: 2 };
  if (field.type === 'boolean') return { width: 110, widthMin: 90, widthFlex: 0.5 };
  if (field.type === 'number') return { width: 130, widthMin: 100, widthFlex: 0.6 };
  if (field.type === 'date' || field.type === 'datetime')
    return { width: 150, widthMin: 120, widthFlex: 0.6 };
  return { width: 170, widthMin: 130, widthFlex: 1 };
}
