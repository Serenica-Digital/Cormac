import { z } from 'zod';

/**
 * The contract meta-schema: the shape of a *published semantic contract*.
 * A contract is the single source of truth for a workspace's business objects.
 * Business objects are data described by this document, never hard-coded tables.
 *
 * Ported deliberately from v0 (`archive/packages/contract/src/contract.ts`,
 * proven against real Postgres before the archive). Code is unchanged; only
 * this header differs. Do not import from archive/.
 *
 * Two flags on every field carry the trust model the rest of the system leans
 * on: `editableByUser` and `editableByAgent`. The agent may only ever write a
 * field whose `editableByAgent` is true, and the control plane enforces that
 * when it validates a proposal.
 */

export const FIELD_TYPES = [
  'string',
  'text',
  'number',
  'boolean',
  'date', // YYYY-MM-DD
  'datetime', // ISO 8601
  'enum',
  'email',
  'phone',
  'relationship', // value is the id of a record of relationshipTargetType
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const apiName = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'apiName must be snake_case (lowercase, digits, underscores)');

/**
 * Attention semantics: a date field can carry what it MEANS to the business's
 * rhythm, so surfaces and agents can act on it without hardcoding column
 * names. `last_touch` = when this record was last contacted/worked;
 * `follow_up` = when it next needs attention. Set during the authoring
 * interview; optional everywhere.
 */
export const FIELD_SEMANTICS = ['last_touch', 'follow_up'] as const;
export type FieldSemantic = (typeof FIELD_SEMANTICS)[number];

export const contractFieldSchema = z
  .object({
    fieldId: z.string().min(1), // stable id, independent of label or column
    apiName,
    label: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    enumOptions: z.array(z.string().min(1)).optional(),
    relationshipTargetType: z.string().optional(),
    editableByUser: z.boolean().default(true),
    editableByAgent: z.boolean().default(false),
    sensitive: z.boolean().default(false),
    excelColumn: z.string().optional(),
    semantic: z.enum(FIELD_SEMANTICS).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === 'enum' && (!field.enumOptions || field.enumOptions.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `enum field "${field.apiName}" requires non-empty enumOptions`,
      });
    }
    if (field.type === 'relationship' && !field.relationshipTargetType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `relationship field "${field.apiName}" requires relationshipTargetType`,
      });
    }
    if (field.semantic && field.type !== 'date' && field.type !== 'datetime') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `semantic "${field.semantic}" on "${field.apiName}" requires a date or datetime field`,
      });
    }
  });
export type ContractField = z.infer<typeof contractFieldSchema>;

export const identityRuleSchema = z.object({
  /** Field apiNames used to match an inbound mention to an existing record. */
  displayFields: z.array(apiName).min(1),
});
export type IdentityRule = z.infer<typeof identityRuleSchema>;

export const aliasSchema = z.object({
  canonical: z.string().min(1),
  variants: z.array(z.string().min(1)).min(1),
});
export type Alias = z.infer<typeof aliasSchema>;

export const contractObjectSchema = z
  .object({
    objectId: z.string().min(1),
    apiName,
    label: z.string().min(1),
    fields: z.array(contractFieldSchema).min(1),
    identity: identityRuleSchema,
    aliases: z.array(aliasSchema).default([]),
  })
  .superRefine((object, ctx) => {
    const fieldNames = new Set(object.fields.map((f) => f.apiName));
    for (const df of object.identity.displayFields) {
      if (!fieldNames.has(df)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `object "${object.apiName}" identity.displayFields references unknown field "${df}"`,
        });
      }
    }
  });
export type ContractObject = z.infer<typeof contractObjectSchema>;

/**
 * The business glossary: meaning that is not field-shaped. Canonical
 * definitions, process notes, and segment context the agent needs but a data
 * dictionary cannot hold. It lives inside the contract, so it shares one
 * publish gate, one version, and one audit trail with the schema.
 */
export const glossaryEntrySchema = z.object({
  entryId: z.string().min(1), // stable id, independent of the term text
  term: z.string().min(1).max(120),
  definition: z.string().min(1).max(2000),
  /** Optional scope: an entry can attach to an object, or to a field on it. */
  appliesTo: z
    .object({
      objectApiName: apiName,
      fieldApiName: apiName.optional(),
    })
    .optional(),
});
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

export const contractSchema = z
  .object({
    name: z.string().min(1),
    version: z.number().int().positive(),
    objects: z.array(contractObjectSchema).min(1),
    // `.default([])` keeps every contract stored before the glossary existed parsing.
    glossary: z.array(glossaryEntrySchema).default([]),
  })
  .superRefine((contract, ctx) => {
    const seenIds = new Set<string>();
    const seenScopedTerms = new Set<string>();
    const objectsByName = new Map(contract.objects.map((o) => [o.apiName, o] as const));

    contract.glossary.forEach((entry, i) => {
      if (seenIds.has(entry.entryId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `glossary entryId "${entry.entryId}" is duplicated`,
          path: ['glossary', i, 'entryId'],
        });
      }
      seenIds.add(entry.entryId);

      const scopeKey = entry.appliesTo
        ? `${entry.appliesTo.objectApiName}.${entry.appliesTo.fieldApiName ?? ''}`
        : '';
      // \u0000 separates scope from term so the two can never collide on concatenation.
      const termKey = `${scopeKey}\u0000${entry.term.toLowerCase()}`;
      if (seenScopedTerms.has(termKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `glossary term "${entry.term}" is duplicated within the same scope`,
          path: ['glossary', i, 'term'],
        });
      }
      seenScopedTerms.add(termKey);

      if (entry.appliesTo) {
        const { objectApiName, fieldApiName } = entry.appliesTo;
        const object = objectsByName.get(objectApiName);
        if (!object) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `glossary entry "${entry.term}" applies to unknown object "${objectApiName}"`,
            path: ['glossary', i, 'appliesTo', 'objectApiName'],
          });
        } else if (fieldApiName && !object.fields.some((f) => f.apiName === fieldApiName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `glossary entry "${entry.term}" applies to unknown field "${fieldApiName}" on "${objectApiName}"`,
            path: ['glossary', i, 'appliesTo', 'fieldApiName'],
          });
        }
      }
    });
  });
export type Contract = z.infer<typeof contractSchema>;

/** Find an object by apiName, or undefined. */
export function getObject(contract: Contract, objectApiName: string): ContractObject | undefined {
  return contract.objects.find((o) => o.apiName === objectApiName);
}

/** Parse and fully validate an untrusted contract document. Throws on invalid. */
export function parseContract(input: unknown): Contract {
  return contractSchema.parse(input);
}
