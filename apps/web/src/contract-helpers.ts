import type { Contract, ContractField, ContractObject } from '@cormac/contract';

export function objectFor(
  contract: Contract | undefined,
  apiName: string,
): ContractObject | undefined {
  return contract?.objects.find((o) => o.apiName === apiName);
}

export function fieldLabel(object: ContractObject | undefined, fieldApiName: string): string {
  return object?.fields.find((f) => f.apiName === fieldApiName)?.label ?? fieldApiName;
}

export function fieldFor(
  object: ContractObject | undefined,
  fieldApiName: string,
): ContractField | undefined {
  return object?.fields.find((f) => f.apiName === fieldApiName);
}

/** Identity display fields first, then the rest, capped for a readable table. */
export function tableColumns(object: ContractObject, cap = 6): ContractField[] {
  const identity = object.identity.displayFields;
  const ordered = [
    ...object.fields.filter((f) => identity.includes(f.apiName)),
    ...object.fields.filter((f) => !identity.includes(f.apiName)),
  ];
  return ordered.slice(0, cap);
}

/** A record's human handle: its identity display field values joined. */
export function recordTitle(
  object: ContractObject | undefined,
  data: Record<string, unknown>,
): string {
  if (!object) return '(record)';
  const parts = object.identity.displayFields
    .map((f) => data[f])
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(String);
  return parts.length ? parts.join(' · ') : '(unnamed)';
}
