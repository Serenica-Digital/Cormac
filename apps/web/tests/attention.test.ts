import { describe, expect, it } from 'vitest';
import type { ContractObject } from '@cormac/contract';
import type { BusinessRecordRow } from '@/api/types';
import {
  buildAttention,
  dayWord,
  FOLLOW_UP_HORIZON_DAYS,
  STALE_AFTER_DAYS,
} from '@/lib/attention';

/** Noon local avoids any midnight edge in local-day derivation. */
const NOW = new Date('2026-07-13T12:00:00');

const contact: ContractObject = {
  objectId: 'obj_contact',
  apiName: 'contact',
  label: 'Contact',
  fields: [
    {
      fieldId: 'fld_name',
      apiName: 'full_name',
      label: 'Full name',
      type: 'string',
      required: true,
      editableByUser: true,
      editableByAgent: true,
      sensitive: false,
    },
    {
      fieldId: 'fld_last',
      apiName: 'date_last_contacted',
      label: 'Date last contacted',
      type: 'date',
      required: false,
      editableByUser: true,
      editableByAgent: true,
      sensitive: false,
      semantic: 'last_touch',
    },
    {
      fieldId: 'fld_next',
      apiName: 'follow_up_date',
      label: 'Follow-up date',
      type: 'date',
      required: false,
      editableByUser: true,
      editableByAgent: true,
      sensitive: false,
      semantic: 'follow_up',
    },
  ],
  identity: { displayFields: ['full_name'] },
  aliases: [],
};

/** An object with date fields but no semantics: contributes nothing, honestly. */
const untagged: ContractObject = {
  ...contact,
  objectId: 'obj_org',
  apiName: 'organization',
  label: 'Organization',
  fields: contact.fields.map((f) => ({ ...f, semantic: undefined })),
};

let n = 0;
function row(
  objectApiName: string,
  data: Record<string, unknown>,
  extra: Partial<BusinessRecordRow> = {},
): BusinessRecordRow {
  return {
    id: `rec_${++n}`,
    workspace_id: 'ws',
    object_api_name: objectApiName,
    contract_version_id: 'cv',
    data,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...extra,
  };
}

describe('buildAttention', () => {
  it('classifies follow-ups: overdue, due today, within the horizon; ignores beyond it', () => {
    const records = [
      row('contact', { full_name: 'Overdue Olive', follow_up_date: '2026-07-10' }),
      row('contact', { full_name: 'Today Tom', follow_up_date: '2026-07-13' }),
      row('contact', { full_name: 'Horizon Hana', follow_up_date: '2026-07-20' }),
      row('contact', { full_name: 'Faraway Fred', follow_up_date: '2026-09-01' }),
    ];
    const a = buildAttention({ objects: [contact], records, pendingCount: 0, now: NOW });
    expect(a.followUps.map((i) => [i.title, i.kind, i.detail])).toEqual([
      ['Overdue Olive', 'follow_up_overdue', 'follow-up was due Jul 10'],
      ['Today Tom', 'follow_up_due', 'follow-up due today'],
      ['Horizon Hana', 'follow_up_due', 'follow-up due Jul 20'],
    ]);
    expect(FOLLOW_UP_HORIZON_DAYS).toBe(7); // Hana sits exactly on the horizon
  });

  it('marks records quiet past the stale window, unless a follow-up is already in play', () => {
    const records = [
      row('contact', { full_name: 'Quiet Quinn', date_last_contacted: '2026-04-30' }),
      row('contact', { full_name: 'Fresh Fiona', date_last_contacted: '2026-07-01' }),
      row('contact', {
        full_name: 'Scheduled Sam',
        date_last_contacted: '2026-04-01',
        follow_up_date: '2026-09-01', // deliberate future plan: not "gone quiet"
      }),
    ];
    const a = buildAttention({ objects: [contact], records, pendingCount: 0, now: NOW });
    expect(a.stale.map((i) => [i.title, i.detail])).toEqual([['Quiet Quinn', 'quiet for 74 days']]);
    expect(STALE_AFTER_DAYS).toBe(30);
  });

  it('sorts most-urgent first and concatenates follow-ups before stale', () => {
    const records = [
      row('contact', { full_name: 'B', follow_up_date: '2026-07-15' }),
      row('contact', { full_name: 'A', follow_up_date: '2026-07-01' }),
      row('contact', { full_name: 'D', date_last_contacted: '2026-06-01' }),
      row('contact', { full_name: 'C', date_last_contacted: '2026-03-01' }),
    ];
    const a = buildAttention({ objects: [contact], records, pendingCount: 2, now: NOW });
    expect(a.items.map((i) => i.title)).toEqual(['A', 'B', 'C', 'D']);
    expect(a.pendingCount).toBe(2);
  });

  it('produces nothing for untagged objects, archived records, or non-date junk', () => {
    const records = [
      row('organization', { full_name: 'Untagged Org', follow_up_date: '2026-07-01' }),
      row(
        'contact',
        { full_name: 'Archived Andy', follow_up_date: '2026-07-01' },
        { archived_at: '2026-07-01T00:00:00Z' },
      ),
      row('contact', { full_name: 'Junk Jane', follow_up_date: 'call him monday' }),
      row('contact', { full_name: 'Empty Ed' }),
    ];
    const a = buildAttention({
      objects: [contact, untagged],
      records,
      pendingCount: 0,
      now: NOW,
    });
    expect(a.items).toEqual([]);
  });

  it('reads datetime values by their calendar day', () => {
    const records = [
      row('contact', { full_name: 'Timestamp Tia', follow_up_date: '2026-07-13T09:30:00Z' }),
    ];
    const a = buildAttention({ objects: [contact], records, pendingCount: 0, now: NOW });
    expect(a.followUps[0]?.detail).toBe('follow-up due today');
  });
});

describe('dayWord', () => {
  it('speaks in relative words near today, short dates otherwise', () => {
    expect(dayWord('2026-07-13', '2026-07-13')).toBe('today');
    expect(dayWord('2026-07-14', '2026-07-13')).toBe('tomorrow');
    expect(dayWord('2026-07-12', '2026-07-13')).toBe('yesterday');
    expect(dayWord('2026-07-20', '2026-07-13')).toBe('Jul 20');
    expect(dayWord('2025-12-31', '2026-07-13')).toBe('Dec 31, 2025');
  });
});
