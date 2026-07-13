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
