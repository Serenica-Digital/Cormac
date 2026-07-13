import { z } from 'zod';
import type { Contract, ContractField, ContractObject } from './contract.js';
import { getObject } from './contract.js';
import type { Proposal } from './proposal.js';

/**
 * Build a Zod schema for a single contract field's value. This is how a
 * client-defined field type becomes an enforced type at write time.
 */
export function fieldValueSchema(field: ContractField): z.ZodTypeAny {
  switch (field.type) {
    case 'string':
    case 'text':
      return z.string();
    case 'email':
      return z.string().email();
    case 'phone':
      return z.string().min(3);
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected date as YYYY-MM-DD');
    case 'datetime':
      return z.string().datetime({ message: 'expected ISO 8601 datetime' });
    case 'enum': {
      const opts = field.enumOptions ?? [];
      return opts.length > 0 ? z.enum(opts as [string, ...string[]]) : z.never();
    }
    case 'relationship':
      return z.string().min(1);
  }
}

/**
 * Build a record-data schema for an object. `create` enforces required fields;
 * `update` makes everything optional (a partial patch). Unknown keys are not
 * stripped silently here; the caller checks membership and agent-editability
 * explicitly so it can produce field-specific errors.
 */
export function recordDataSchema(object: ContractObject, mode: 'create' | 'update'): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of object.fields) {
    const base = fieldValueSchema(field);
    const required = mode === 'create' && field.required;
    shape[field.apiName] = required ? base : base.optional();
  }
  return z.object(shape);
}

export interface ProposalValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * The trust-critical check (ADR-005, ADR-006). Given the active contract and an
 * already-shape-parsed proposal, confirm every change is legal:
 *   - the object exists in the contract,
 *   - every field being written exists on that object,
 *   - every field being written is editable by the acting party (agent by
 *     default; pass `editableBy: 'user'` for a human edit/import path),
 *   - every value matches the field's type / enum / format,
 *   - create vs update is consistent with recordId.
 * Returns a flat list of human-readable errors. Empty list means safe to hold
 * as a proposal. This never writes anything.
 */
export function validateProposalAgainstContract(
  contract: Contract,
  proposal: Proposal,
  opts: { editableBy?: 'agent' | 'user' } = {},
): ProposalValidationResult {
  const editableBy = opts.editableBy ?? 'agent';
  const errors: string[] = [];

  proposal.changes.forEach((change, i) => {
    const where = `change[${i}]`;
    const object = getObject(contract, change.objectApiName);
    if (!object) {
      errors.push(`${where}: unknown object "${change.objectApiName}"`);
      return;
    }

    if (change.op === 'update' && !change.recordId) {
      errors.push(`${where}: an update requires a recordId`);
    }
    if (change.op === 'create' && change.recordId) {
      errors.push(`${where}: a create must not target an existing recordId`);
    }

    const fieldsByName = new Map(object.fields.map((f) => [f.apiName, f] as const));
    for (const key of Object.keys(change.values)) {
      const field = fieldsByName.get(key);
      if (!field) {
        errors.push(`${where}: unknown field "${key}" on object "${object.apiName}"`);
        continue;
      }
      const editable = editableBy === 'user' ? field.editableByUser : field.editableByAgent;
      if (!editable) {
        errors.push(
          `${where}: field "${key}" on "${object.apiName}" is not ${editableBy}-editable`,
        );
      }
    }

    const parsed = recordDataSchema(object, change.op).safeParse(change.values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || '(record)';
        errors.push(`${where}.${path}: ${issue.message}`);
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
