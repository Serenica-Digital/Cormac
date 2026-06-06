import { z } from 'zod';

/**
 * The structured output the agent runtime returns (ADR-006, ADR-008). This is
 * the *shape* contract only. It is untrusted until the control plane validates
 * it against the active semantic contract (validateProposalAgainstContract) and
 * turns it into a held proposal. The runtime never writes; it proposes.
 */

export const proposedChangeSchema = z.object({
  objectApiName: z.string().min(1),
  op: z.enum(['create', 'update']),
  /** Present for `update`, absent/null for `create`. */
  recordId: z.string().min(1).nullable().optional(),
  /** field apiName -> proposed value. Validated against the contract later. */
  values: z.record(z.string(), z.unknown()),
  rationale: z.string().optional(),
});
export type ProposedChange = z.infer<typeof proposedChangeSchema>;

export const proposalSchema = z.object({
  changes: z.array(proposedChangeSchema).min(1),
  notes: z.string().optional(),
  /** The agent self-flags ambiguity. Surfaced to the reviewer (ADR-008). */
  uncertain: z.boolean().default(false),
});
export type Proposal = z.infer<typeof proposalSchema>;

/** Parse untrusted runtime output into a shape-valid Proposal. Throws on bad shape. */
export function parseProposal(input: unknown): Proposal {
  return proposalSchema.parse(input);
}

/** Non-throwing variant for the adapter, which must reject rather than crash. */
export function safeParseProposal(input: unknown): z.SafeParseReturnType<unknown, Proposal> {
  return proposalSchema.safeParse(input);
}
