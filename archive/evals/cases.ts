import type { RecordSummary } from '../services/runtime-stub/src/propose.js';

export interface EvalCase {
  name: string;
  text: string;
  records: RecordSummary[];
  expect: {
    op: 'create' | 'update';
    objectApiName: string;
    recordId?: string;
    fullName?: string;
    valueKeys?: string[];
  };
}

const john: RecordSummary = {
  objectApiName: 'person',
  id: 'person-john',
  display: { full_name: 'John Carter' },
};

export const CASES: EvalCase[] = [
  {
    name: 'matches an existing person and updates interaction',
    text: "Talked to John about the waterfront deal, he's interested.",
    records: [john],
    expect: {
      op: 'update',
      objectApiName: 'person',
      recordId: 'person-john',
      valueKeys: ['last_interaction_date', 'last_interaction_note', 'status'],
    },
  },
  {
    name: 'creates a new person from an unfamiliar name',
    text: 'Met Sarah Connor about a new listing.',
    records: [],
    expect: { op: 'create', objectApiName: 'person', fullName: 'Sarah Connor' },
  },
  {
    name: 'detects a dormant status signal',
    text: 'John has gone quiet, no response in weeks.',
    records: [john],
    expect: { op: 'update', objectApiName: 'person', recordId: 'person-john', valueKeys: ['status'] },
  },
];
