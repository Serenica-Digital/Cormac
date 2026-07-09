import { describe, expect, it } from 'vitest';
import { buildNav } from '@/lib/nav';

describe('buildNav', () => {
  it('leads with setup before the book is live, everyday pages disabled', () => {
    const groups = buildNav({ live: false });
    expect(groups[0]?.items.map((i) => i.label)).toEqual([
      'Get started',
      'Your workbook',
      'Talk with Cormac',
    ]);
    expect(groups[0]?.items.every((i) => !i.disabled)).toBe(true);

    const book = groups[1];
    expect(book?.label).toBe('Your book');
    expect(book?.items.map((i) => i.label)).toEqual(['Inbox', 'Records', 'History']);
    expect(book?.items.every((i) => i.disabled && i.hint === 'Opens after setup')).toBe(true);

    // Structure is meaningless before publish; it must not appear at all.
    const destinations = groups.flatMap((g) => g.items.map((i) => i.to));
    expect(destinations).not.toContain('contract');
  });

  it('leads with everyday work once live, setup in a quieter group', () => {
    const groups = buildNav({ live: true });
    expect(groups[0]?.items.map((i) => i.label)).toEqual(['Inbox', 'Records', 'History']);
    expect(groups[0]?.items.map((i) => i.to)).toEqual(['inbox', 'records', 'audit']);

    const setup = groups[1];
    expect(setup?.label).toBe('Setup');
    expect(setup?.items.map((i) => i.label)).toEqual([
      'Structure',
      'Your workbook',
      'Talk with Cormac',
    ]);

    const all = groups.flatMap((g) => g.items);
    expect(all.every((i) => !i.disabled)).toBe(true);
    expect(all.map((i) => i.to)).not.toContain('start');
  });
});
