import { describe, expect, it } from 'vitest';
import { contractFieldSchema } from '@cormac/contract';

/**
 * The attention-semantics vocabulary on contract fields: `last_touch` and
 * `follow_up` carry what a date column means to the business's rhythm, so
 * surfaces and agents can act on it without hardcoded column names. Date
 * fields only; optional everywhere.
 */
const base = {
  fieldId: 'fld_x',
  apiName: 'x',
  label: 'X',
};

describe('contract field semantic', () => {
  it('accepts last_touch and follow_up on date and datetime fields', () => {
    for (const type of ['date', 'datetime'] as const) {
      for (const semantic of ['last_touch', 'follow_up'] as const) {
        const parsed = contractFieldSchema.safeParse({ ...base, type, semantic });
        expect(parsed.success, `${semantic} on ${type}`).toBe(true);
      }
    }
  });

  it('rejects a semantic on non-date fields', () => {
    for (const type of ['string', 'text', 'number', 'boolean', 'enum'] as const) {
      const parsed = contractFieldSchema.safeParse({
        ...base,
        type,
        semantic: 'last_touch',
        ...(type === 'enum' ? { enumOptions: ['a'] } : {}),
      });
      expect(parsed.success, type).toBe(false);
    }
  });

  it('rejects unknown semantic values and stays optional', () => {
    expect(
      contractFieldSchema.safeParse({ ...base, type: 'date', semantic: 'birthday' }).success,
    ).toBe(false);
    expect(contractFieldSchema.safeParse({ ...base, type: 'date' }).success).toBe(true);
  });
});
