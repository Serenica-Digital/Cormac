import { describe, it, expect } from 'vitest';
import { getObject } from './contract.js';
import { EXAMPLE_PERSON_CONTRACT } from './fixtures.js';
import { REDACTED, buildContextDisplay, redactSensitive, sensitiveFieldNames } from './redact.js';

const person = getObject(EXAMPLE_PERSON_CONTRACT, 'person')!;
const record = {
  full_name: 'John Carter',
  email: 'john@carterdeals.test',
  status: 'lead',
};

describe('sensitive-field handling', () => {
  it('identifies sensitive fields from the contract', () => {
    const names = sensitiveFieldNames(person);
    expect(names.has('email')).toBe(true);
    expect(names.has('full_name')).toBe(false);
  });

  it('keeps sensitive values out of the model context, even identity fields', () => {
    // email is both an identity (display) field AND sensitive; it must not leak.
    const display = buildContextDisplay(person, record);
    expect(display.full_name).toBe('John Carter');
    expect('email' in display).toBe(false);
  });

  it('masks sensitive values for logging but keeps the rest', () => {
    const masked = redactSensitive(person, record);
    expect(masked.email).toBe(REDACTED);
    expect(masked.full_name).toBe('John Carter');
    expect(masked.status).toBe('lead');
  });
});
