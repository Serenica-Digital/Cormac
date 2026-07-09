import { describe, expect, it } from 'vitest';
import {
  buildContextDisplay,
  parseContract,
  REDACTED,
  redactSensitive,
  sensitiveFieldNames,
} from '@cormac/contract';

/**
 * The sensitive-field minimization control (control register row: sensitive
 * values never reach the model context). buildContextDisplay is load-bearing
 * on every agent read (repo.listRecordSummaries, /agent/records); until this
 * suite existed the register could only call the control Partial.
 */
const contract = parseContract({
  name: 'Redaction test book',
  version: 1,
  objects: [
    {
      objectId: 'o-client',
      apiName: 'client',
      label: 'Client',
      identity: { displayFields: ['full_name', 'ssn_last4'] },
      fields: [
        { fieldId: 'f-name', apiName: 'full_name', label: 'Full name', type: 'string', required: true },
        { fieldId: 'f-ssn', apiName: 'ssn_last4', label: 'SSN last 4', type: 'string', sensitive: true },
        { fieldId: 'f-balance', apiName: 'balance', label: 'Balance', type: 'number', sensitive: true },
        { fieldId: 'f-city', apiName: 'city', label: 'City', type: 'string' },
      ],
    },
  ],
});
const client = contract.objects[0]!;

const record = {
  full_name: 'Morgan Ellis',
  ssn_last4: '1234',
  balance: 250_000,
  city: 'Savannah',
};

describe('sensitive-field redaction', () => {
  it('names exactly the contract-flagged fields as sensitive', () => {
    expect(sensitiveFieldNames(client)).toEqual(new Set(['ssn_last4', 'balance']));
  });

  it('excludes sensitive values from the model-facing display, even identity fields', () => {
    const display = buildContextDisplay(client, record);
    expect(display).toEqual({ full_name: 'Morgan Ellis' });
    // The whole payload, stringified, carries no sensitive value.
    const wire = JSON.stringify(display);
    expect(wire).not.toContain('1234');
    expect(wire).not.toContain('250000');
  });

  it('masks sensitive values (and only those) for log-bound copies', () => {
    const masked = redactSensitive(client, record);
    expect(masked).toEqual({
      full_name: 'Morgan Ellis',
      ssn_last4: REDACTED,
      balance: REDACTED,
      city: 'Savannah',
    });
    // The original is untouched: audit needs true values.
    expect(record.ssn_last4).toBe('1234');
  });

  it('treats a contract with no sensitive flags as fully displayable', () => {
    const open = parseContract({
      name: 'Open book',
      version: 1,
      objects: [
        {
          objectId: 'o-note',
          apiName: 'note',
          label: 'Note',
          identity: { displayFields: ['title'] },
          fields: [{ fieldId: 'f-title', apiName: 'title', label: 'Title', type: 'string', required: true }],
        },
      ],
    });
    expect(buildContextDisplay(open.objects[0]!, { title: 'hello' })).toEqual({ title: 'hello' });
  });
});
