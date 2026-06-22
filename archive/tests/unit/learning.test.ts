import { describe, it, expect } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '../../packages/contract/src/fixtures.js';
import {
  parseLearnedPayload,
  safeParseLearnedPayload,
  validateLearningAgainstContract,
} from '../../packages/contract/src/learning.js';

const contract = EXAMPLE_PERSON_CONTRACT;
const UUID = '11111111-1111-4111-8111-111111111111';

describe('learned payload shape', () => {
  it('parses a valid alias payload', () => {
    expect(parseLearnedPayload('alias', { objectApiName: 'person', recordId: UUID, variant: 'Johnny' })).toMatchObject(
      { objectApiName: 'person', variant: 'Johnny' },
    );
  });

  it('rejects an alias whose recordId is not a uuid (no name in the payload)', () => {
    expect(safeParseLearnedPayload('alias', { objectApiName: 'person', recordId: 'rec-1', variant: 'J' }).success).toBe(
      false,
    );
  });

  it('parses a valid enum_synonym payload', () => {
    expect(
      parseLearnedPayload('enum_synonym', {
        objectApiName: 'person',
        fieldApiName: 'status',
        synonym: 'prospect',
        canonicalOption: 'lead',
      }),
    ).toMatchObject({ synonym: 'prospect', canonicalOption: 'lead' });
  });
});

describe('validateLearningAgainstContract', () => {
  it('accepts an alias to a known object', () => {
    expect(
      validateLearningAgainstContract(contract, 'alias', { objectApiName: 'person', recordId: UUID, variant: 'Johnny' })
        .ok,
    ).toBe(true);
  });

  it('rejects an alias to an unknown object', () => {
    const r = validateLearningAgainstContract(contract, 'alias', {
      objectApiName: 'company',
      recordId: UUID,
      variant: 'Johnny',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('unknown object'))).toBe(true);
  });

  it('accepts a synonym for a real enum option', () => {
    expect(
      validateLearningAgainstContract(contract, 'enum_synonym', {
        objectApiName: 'person',
        fieldApiName: 'status',
        synonym: 'prospect',
        canonicalOption: 'lead',
      }).ok,
    ).toBe(true);
  });

  it('rejects a synonym whose canonical option is not in the enum', () => {
    const r = validateLearningAgainstContract(contract, 'enum_synonym', {
      objectApiName: 'person',
      fieldApiName: 'status',
      synonym: 'prospect',
      canonicalOption: 'archived',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('not an option'))).toBe(true);
  });

  it('rejects a synonym on a non-enum field', () => {
    const r = validateLearningAgainstContract(contract, 'enum_synonym', {
      objectApiName: 'person',
      fieldApiName: 'full_name',
      synonym: 'x',
      canonicalOption: 'y',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('not an enum'))).toBe(true);
  });

  it('rejects a synonym that shadows an existing option', () => {
    const r = validateLearningAgainstContract(contract, 'enum_synonym', {
      objectApiName: 'person',
      fieldApiName: 'status',
      synonym: 'active',
      canonicalOption: 'lead',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('already exists'))).toBe(true);
  });
});
