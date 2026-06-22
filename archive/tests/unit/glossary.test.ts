import { describe, it, expect } from 'vitest';
import { parseContract } from '../../packages/contract/src/contract.js';

const base = {
  name: 'T',
  version: 1,
  objects: [
    {
      objectId: 'o1',
      apiName: 'person',
      label: 'Person',
      identity: { displayFields: ['full_name'] },
      fields: [
        { fieldId: 'f1', apiName: 'full_name', label: 'Full name', type: 'string', required: true },
        { fieldId: 'f2', apiName: 'status', label: 'Status', type: 'enum', enumOptions: ['lead', 'active'] },
      ],
    },
  ],
};

describe('contract glossary (ADR-027 stratum 2)', () => {
  it('defaults glossary to [] when omitted, so pre-glossary contracts still parse', () => {
    expect(parseContract(base).glossary).toEqual([]);
  });

  it('accepts a valid glossary, global and field-scoped', () => {
    const c = parseContract({
      ...base,
      glossary: [
        { entryId: 'g1', term: 'SOW', definition: 'Sphere of work' },
        {
          entryId: 'g2',
          term: 'Pipeline stage',
          definition: 'How far along a person is',
          appliesTo: { objectApiName: 'person', fieldApiName: 'status' },
        },
      ],
    });
    expect(c.glossary).toHaveLength(2);
  });

  it('rejects a duplicate entryId', () => {
    expect(() =>
      parseContract({
        ...base,
        glossary: [
          { entryId: 'g1', term: 'A', definition: 'x' },
          { entryId: 'g1', term: 'B', definition: 'y' },
        ],
      }),
    ).toThrow(/is duplicated/);
  });

  it('rejects a duplicate term in the same scope, case-insensitively', () => {
    expect(() =>
      parseContract({
        ...base,
        glossary: [
          { entryId: 'g1', term: 'Lead', definition: 'x' },
          { entryId: 'g2', term: 'lead', definition: 'y' },
        ],
      }),
    ).toThrow(/duplicated within the same scope/);
  });

  it('allows the same term in different scopes', () => {
    const c = parseContract({
      ...base,
      glossary: [
        { entryId: 'g1', term: 'Status', definition: 'global meaning' },
        {
          entryId: 'g2',
          term: 'Status',
          definition: 'field meaning',
          appliesTo: { objectApiName: 'person', fieldApiName: 'status' },
        },
      ],
    });
    expect(c.glossary).toHaveLength(2);
  });

  it('rejects appliesTo an unknown object', () => {
    expect(() =>
      parseContract({
        ...base,
        glossary: [{ entryId: 'g1', term: 'X', definition: 'x', appliesTo: { objectApiName: 'ghost' } }],
      }),
    ).toThrow(/unknown object/);
  });

  it('rejects appliesTo an unknown field on a known object', () => {
    expect(() =>
      parseContract({
        ...base,
        glossary: [
          {
            entryId: 'g1',
            term: 'X',
            definition: 'x',
            appliesTo: { objectApiName: 'person', fieldApiName: 'ghost' },
          },
        ],
      }),
    ).toThrow(/unknown field/);
  });
});
