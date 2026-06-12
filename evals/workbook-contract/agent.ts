import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { parseContract, type Contract, type ContractField } from '@cormac/contract';
import { authoringOutputSchema, type AuthoringOutput } from './authoring-schema.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';

/**
 * One run of the Workbook Contract Agent: detected profile in, contract out.
 *
 * Structured outputs (constrained decoding) guarantee the output parses against
 * the authoring schema. We then assign the stable ids the model never sees and
 * run the real parseContract() to get the full-spec validity signal, including
 * the cross-field refinements the grammar could not enforce.
 */

// Sonnet by default: capable enough to read the keystone signal without burning
// top-flight tokens. Set SPIKE_MODEL=claude-opus-4-8 for the high-fidelity pass.
const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface AgentRun {
  model: string;
  rawOutput: AuthoringOutput;
  /** The proposed contract, or null if it failed the real refinements. */
  contract: Contract | null;
  /** The parseContract error, if the proposed contract did not satisfy the full spec. */
  contractError: string | null;
  usage: TokenUsage | null;
}

export function getModel(): string {
  return process.env.SPIKE_MODEL ?? DEFAULT_MODEL;
}

export async function runAgent(detected: unknown): Promise<AgentRun> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Run: ANTHROPIC_API_KEY=... pnpm evals:workbook');
  }
  const model = getModel();
  const client = new Anthropic({ apiKey });

  const message = await client.messages.parse({
    model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(detected) }],
    output_config: { format: zodOutputFormat(authoringOutputSchema) },
  });

  const rawOutput = message.parsed_output;
  if (!rawOutput) {
    throw new Error('Model returned no parsed output (likely a refusal or stop before completion).');
  }

  const { contract, contractError } = assembleContract(rawOutput);

  const u = message.usage;
  const usage: TokenUsage | null = u
    ? {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
      }
    : null;

  return { model, rawOutput, contract, contractError, usage };
}

/** Assign deterministic ids and validate against the full contract spec. */
export function assembleContract(out: AuthoringOutput): {
  contract: Contract | null;
  contractError: string | null;
} {
  const candidate = {
    name: 'Proposed (agent)',
    version: 1,
    objects: out.objects.map((o) => ({
      objectId: `obj_${o.apiName}`,
      apiName: o.apiName,
      label: o.label,
      identity: { displayFields: o.identityDisplayFields },
      aliases: o.aliases,
      fields: o.fields.map((f): ContractField => {
        const field: ContractField = {
          fieldId: `fld_${f.apiName}`,
          apiName: f.apiName,
          label: f.label,
          type: f.type,
          required: f.required,
          editableByUser: f.editableByUser,
          editableByAgent: f.editableByAgent,
          sensitive: f.sensitive,
        };
        if (f.enumOptions) field.enumOptions = f.enumOptions;
        if (f.relationshipTargetType) field.relationshipTargetType = f.relationshipTargetType;
        if (f.sourceColumn) field.excelColumn = f.sourceColumn;
        return field;
      }),
    })),
  };

  try {
    return { contract: parseContract(candidate), contractError: null };
  } catch (err) {
    return { contract: null, contractError: err instanceof Error ? err.message : String(err) };
  }
}
