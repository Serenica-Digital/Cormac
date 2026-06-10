// Zod 4 (via the zod/v4 subpath that ships inside the installed zod 3.25), because
// the Anthropic SDK's zodOutputFormat helper is built against zod/v4. Scoped to
// this spike only: the production contract boundary (@serenica/contract,
// parseContract) stays on Zod 3. The two never cross at the type level — this
// schema validates the model output, then a plain object is handed to parseContract.
import { z } from 'zod/v4';
import { FIELD_TYPES } from '@serenica/contract';

/**
 * The shape the Workbook Contract Agent must emit. It is the contract
 * meta-schema (packages/contract/src/contract.ts) stripped of two things that
 * are bookkeeping rather than judgment:
 *
 *  - stable ids (objectId/fieldId): the harness assigns those deterministically
 *    after the fact, so the model spends no attention on them.
 *  - the cross-field refinements (enum needs enumOptions, identity must
 *    reference real fields): those cannot be expressed in a JSON-schema grammar,
 *    so we leave them off here and let parseContract() enforce them afterward.
 *    A refinement failure is itself a result worth recording.
 *
 * Everything else is required, with no defaults, so the model is forced to
 * commit on the trust-critical calls (editableByAgent, sensitive) rather than
 * letting a default decide. Constrained decoding then guarantees the output is
 * structurally valid by construction.
 */

export const authoringFieldSchema = z.object({
  apiName: z
    .string()
    .describe('snake_case identifier: lowercase letters, digits, underscores; starts with a letter'),
  label: z.string().describe('human-facing field label'),
  type: z
    .enum(FIELD_TYPES)
    .describe(
      'one of string, text, number, boolean, date, datetime, enum, email, phone, relationship',
    ),
  required: z.boolean().describe('must every record have a value for this field'),
  enumOptions: z
    .array(z.string())
    .optional()
    .describe('the normalized option set when type is enum; omit otherwise'),
  relationshipTargetType: z
    .string()
    .optional()
    .describe('apiName of the object this points to when type is relationship; omit otherwise'),
  editableByUser: z.boolean().describe('may a human edit this field'),
  editableByAgent: z
    .boolean()
    .describe(
      'TRUST-CRITICAL: may the agent ever write this field. Set false for internal human judgments the agent should never set on its own.',
    ),
  sensitive: z
    .boolean()
    .describe('is this PII (email, phone, etc.) that must be kept out of model context'),
  sourceColumn: z
    .string()
    .optional()
    .describe('the workbook column this field was derived from, for traceability'),
});
export type AuthoringField = z.infer<typeof authoringFieldSchema>;

export const authoringAliasSchema = z.object({
  canonical: z.string(),
  variants: z.array(z.string()).describe('other words in the workbook that mean the same thing'),
});

export const authoringObjectSchema = z.object({
  apiName: z.string().describe('snake_case singular object name, e.g. person or deal'),
  label: z.string(),
  fields: z.array(authoringFieldSchema).min(1),
  identityDisplayFields: z
    .array(z.string())
    .min(1)
    .describe(
      'TRUST-CRITICAL: the field apiNames used to recognize an existing record from an inbound mention. Choose the fields a human would use to say "this is the same person/deal".',
    ),
  aliases: z.array(authoringAliasSchema),
});
export type AuthoringObject = z.infer<typeof authoringObjectSchema>;

export const lowConfidenceSchema = z.object({
  area: z
    .string()
    .describe('the specific decision you are unsure about, e.g. "deal.contact relationship" or "person.priority editableByAgent"'),
  why: z.string().describe('what makes it ambiguous and what you would ask the manager'),
});

export const authoringOutputSchema = z.object({
  objects: z.array(authoringObjectSchema).min(1),
  assumptions: z
    .array(z.string())
    .describe('defaults you chose where the workbook was ambiguous'),
  openQuestions: z
    .array(z.string())
    .describe('questions you would ask the manager before publishing this contract'),
  lowConfidence: z
    .array(lowConfidenceSchema)
    .describe('the specific high-stakes calls you are least sure about'),
});
export type AuthoringOutput = z.infer<typeof authoringOutputSchema>;
