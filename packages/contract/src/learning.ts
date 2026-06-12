import { z } from 'zod';
import type { Contract } from './contract.js';
import { apiName, getObject } from './contract.js';

/**
 * Learned knowledge (ADR-027 stratum 3): the only autonomous learning lane, and
 * deliberately the narrowest one. The agent proposes values into typed slots,
 * never free text, so a learned item cannot generalize into an over-specific
 * prose rule (the overfitting and poisoning quadrant ADR-027 excludes). Every
 * item is one row, listable and revocable one at a time.
 *
 * Two kinds ship in v1. `precedent` (a disambiguation memory) is deferred: it is
 * free-text memory in a typed wrapper, and it would auto-apply under
 * apply-then-report, which is the exact quadrant we exclude. It returns with a
 * tighter schema later.
 *
 * - alias: binds a spoken variant ("Johnny") to ONE record. The payload stores
 *   the record id, never a name; the canonical display is rendered at compile
 *   time through buildContextDisplay (render.ts), so sensitive values never
 *   reach the prefix.
 * - enum_synonym: binds a synonym ("prospect") to a canonical enum option
 *   ("lead") on one field.
 *
 * These schemas are the SHAPE only. Like a proposal, a learned item is untrusted
 * until validateLearningAgainstContract checks it against the active contract,
 * and (for alias) the control plane checks the record exists.
 */

export const LEARNED_KINDS = ['alias', 'enum_synonym'] as const;
export type LearnedKind = (typeof LEARNED_KINDS)[number];

export const aliasPayloadSchema = z.object({
  objectApiName: apiName,
  recordId: z.string().uuid(),
  variant: z.string().min(1).max(200),
});
export type AliasPayload = z.infer<typeof aliasPayloadSchema>;

export const enumSynonymPayloadSchema = z.object({
  objectApiName: apiName,
  fieldApiName: apiName,
  synonym: z.string().min(1).max(200),
  canonicalOption: z.string().min(1),
});
export type EnumSynonymPayload = z.infer<typeof enumSynonymPayloadSchema>;

export type LearnedPayload = AliasPayload | EnumSynonymPayload;

const SCHEMA_BY_KIND = {
  alias: aliasPayloadSchema,
  enum_synonym: enumSynonymPayloadSchema,
} as const satisfies Record<LearnedKind, z.ZodTypeAny>;

/** Parse an untrusted learned payload for a kind. Throws on bad shape. */
export function parseLearnedPayload(kind: LearnedKind, input: unknown): LearnedPayload {
  return SCHEMA_BY_KIND[kind].parse(input) as LearnedPayload;
}

/** Non-throwing variant, for handlers that must reject rather than crash. */
export function safeParseLearnedPayload(
  kind: LearnedKind,
  input: unknown,
): z.SafeParseReturnType<unknown, LearnedPayload> {
  return SCHEMA_BY_KIND[kind].safeParse(input) as z.SafeParseReturnType<unknown, LearnedPayload>;
}

export interface LearningValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Confirm a shape-parsed learned item is legal against the active contract. The
 * mirror of validateProposalAgainstContract, for learning. It does NOT check
 * record existence: the contract holds no records, so the control plane checks
 * that for alias at propose time and again at render time. Returns a flat list
 * of human-readable errors; empty means safe to hold.
 */
export function validateLearningAgainstContract(
  contract: Contract,
  kind: LearnedKind,
  payload: LearnedPayload,
): LearningValidationResult {
  const errors: string[] = [];

  if (kind === 'alias') {
    const p = payload as AliasPayload;
    if (!getObject(contract, p.objectApiName)) {
      errors.push(`unknown object "${p.objectApiName}"`);
    }
    return { ok: errors.length === 0, errors };
  }

  const p = payload as EnumSynonymPayload;
  const object = getObject(contract, p.objectApiName);
  if (!object) {
    errors.push(`unknown object "${p.objectApiName}"`);
    return { ok: false, errors };
  }
  const field = object.fields.find((f) => f.apiName === p.fieldApiName);
  if (!field) {
    errors.push(`unknown field "${p.fieldApiName}" on "${p.objectApiName}"`);
    return { ok: false, errors };
  }
  if (field.type !== 'enum') {
    errors.push(`field "${p.fieldApiName}" is not an enum, so it has no synonyms`);
    return { ok: false, errors };
  }
  const options = field.enumOptions ?? [];
  if (!options.includes(p.canonicalOption)) {
    errors.push(`"${p.canonicalOption}" is not an option of "${p.fieldApiName}"`);
  }
  // A synonym must add vocabulary, not shadow an option that already exists.
  const lowerOptions = new Set(options.map((o) => o.toLowerCase()));
  if (lowerOptions.has(p.synonym.toLowerCase())) {
    errors.push(`synonym "${p.synonym}" already exists as an option of "${p.fieldApiName}"`);
  }
  if (p.synonym.toLowerCase() === p.canonicalOption.toLowerCase()) {
    errors.push(`synonym "${p.synonym}" is identical to its canonical option`);
  }

  return { ok: errors.length === 0, errors };
}
