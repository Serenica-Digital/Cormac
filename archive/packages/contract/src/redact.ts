import type { ContractObject } from './contract.js';

/**
 * Sensitivity is a contract property, not a product assumption (ADR-015). The
 * platform is data-agnostic: any tenant's contract may mark any field
 * `sensitive`. These helpers make that flag load-bearing so two claims in the
 * security packet are actually enforced:
 *
 *   1. Data minimization to the model: sensitive field values are never put in
 *      the runtime/model context. The agent matches and reasons on the minimum
 *      it needs; sensitive values stay inside the control plane.
 *   2. Log hygiene: sensitive values are masked wherever record data is logged.
 *
 * The audit trail is deliberately NOT redacted. It must hold true before/after
 * values to be a real record; it lives in the database under RLS, not in logs.
 */

export const REDACTED = '[redacted]';

export function sensitiveFieldNames(object: ContractObject): Set<string> {
  return new Set(object.fields.filter((f) => f.sensitive).map((f) => f.apiName));
}

/**
 * Build the display object sent to the runtime for matching, from an object's
 * identity fields, excluding any that are sensitive. Minimization by default:
 * the model sees identity fields it needs to match on, never sensitive values.
 */
export function buildContextDisplay(
  object: ContractObject,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const sensitive = sensitiveFieldNames(object);
  const display: Record<string, unknown> = {};
  for (const fieldName of object.identity.displayFields) {
    if (sensitive.has(fieldName)) continue;
    display[fieldName] = data[fieldName];
  }
  return display;
}

/**
 * Return a copy of record data with sensitive values masked. Use this anywhere
 * record data would be written to a log. Not for the audit trail.
 */
export function redactSensitive(
  object: ContractObject,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const sensitive = sensitiveFieldNames(object);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = sensitive.has(key) ? REDACTED : value;
  }
  return out;
}
