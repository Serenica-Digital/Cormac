import { describe, it, expect } from 'vitest';
import { propose, type RecordSummary } from './propose.js';

const john: RecordSummary = {
  objectApiName: 'person',
  id: 'person-john',
  display: { full_name: 'John Carter', email: 'john@carterdeals.test' },
};

describe('runtime-stub propose', () => {
  it('matches an existing person and proposes an update', () => {
    const out = propose({
      workspaceId: 'w1',
      contract: {},
      text: "Talked to John about the waterfront deal, he's interested.",
      records: [john],
    });
    expect(out.changes).toHaveLength(1);
    const change = out.changes[0]!;
    expect(change.op).toBe('update');
    expect(change.recordId).toBe('person-john');
    expect(change.values.status).toBe('active');
    expect(typeof change.values.last_interaction_note).toBe('string');
  });

  it('creates a new person when an unfamiliar name is mentioned', () => {
    const out = propose({
      workspaceId: 'w1',
      contract: {},
      text: 'Met Sarah Connor about a new listing.',
      records: [],
    });
    const change = out.changes[0]!;
    expect(change.op).toBe('create');
    expect(change.values.full_name).toBe('Sarah Connor');
  });

  it('overreaches into the human-only rating when asked, for the gate to catch', () => {
    const out = propose({
      workspaceId: 'w1',
      contract: {},
      text: 'Set rating to 9 for John.',
      records: [john],
    });
    expect(out.changes[0]!.values.internal_rating).toBe(9);
  });

  it('flags uncertainty when it cannot identify a person', () => {
    const out = propose({ workspaceId: 'w1', contract: {}, text: 'paperwork filed', records: [] });
    expect(out.uncertain).toBe(true);
  });
});
