import { z } from 'zod';

/**
 * The contract meta-schema: the shape of a *published semantic contract*
 * (ADR-002, contract-model.md). A contract is the single source of truth for a
 * workspace's business objects. Business objects are data described by this
 * document, never hard-coded tables.
 *
 * Two flags on every field carry the trust model the rest of the system leans
 * on: `editableByUser` and `editableByAgent`. The agent may only ever write a
 * field whose `editableByAgent` is true, and the control plane enforces that
 * when it validates a proposal (see validateProposalAgainstContract).
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

const apiName = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'apiName must be snake_case (lowercase, digits, underscores)');

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

export const contractSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  objects: z.array(contractObjectSchema).min(1),
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
