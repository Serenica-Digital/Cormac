import { describe, it, expect } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '../../packages/contract/src/fixtures.js';
import { parseProposal } from '../../packages/contract/src/proposal.js';
import { validateProposalAgainstContract } from '../../packages/contract/src/validate.js';

const contract = EXAMPLE_PERSON_CONTRACT;

describe('validateProposalAgainstContract', () => {
  it('accepts a well-formed update to agent-editable fields', () => {
    const proposal = parseProposal({
      changes: [
        {
          objectApiName: 'person',
          op: 'update',
          recordId: 'rec-1',
          values: {
            last_interaction_date: '2026-06-06',
            last_interaction_note: 'Talked about the waterfront deal.',
            status: 'active',
          },
        },
      ],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a write to a human-only field', () => {
    const proposal = parseProposal({
      changes: [
        { objectApiName: 'person', op: 'update', recordId: 'rec-1', values: { internal_rating: 9 } },
      ],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('not agent-editable'))).toBe(true);
  });

  it('rejects a value outside an enum', () => {
    const proposal = parseProposal({
      changes: [
        { objectApiName: 'person', op: 'update', recordId: 'rec-1', values: { status: 'archived' } },
      ],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    expect(result.ok).toBe(false);
  });

  it('rejects a badly typed date', () => {
    const proposal = parseProposal({
      changes: [
        {
          objectApiName: 'person',
          op: 'update',
          recordId: 'rec-1',
          values: { last_interaction_date: 'yesterday' },
        },
      ],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown field', () => {
    const proposal = parseProposal({
      changes: [
        {
          objectApiName: 'person',
          op: 'update',
          recordId: 'rec-1',
          values: { favorite_color: 'blue' },
        },
      ],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown field'))).toBe(true);
  });

  it('rejects an unknown object', () => {
    const proposal = parseProposal({
      changes: [{ objectApiName: 'dragon', op: 'create', values: { full_name: 'Smaug' } }],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown object'))).toBe(true);
  });

  it('requires a recordId on update', () => {
    const proposal = parseProposal({
      changes: [{ objectApiName: 'person', op: 'update', values: { status: 'active' } }],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('requires a recordId'))).toBe(true);
  });

  it('requires required fields on create', () => {
    const proposal = parseProposal({
      changes: [{ objectApiName: 'person', op: 'create', values: { status: 'lead' } }],
    });
    const result = validateProposalAgainstContract(contract, proposal);
    // full_name is required on create
    expect(result.ok).toBe(false);
  });
});
