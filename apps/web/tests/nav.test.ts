import { describe, expect, it } from 'vitest';
import { ROLES } from '@cormac/authz';
import { buildNav } from '@/lib/nav';

const destinations = (groups: ReturnType<typeof buildNav>) =>
  groups.flatMap((g) => g.items.map((i) => i.to));

describe('buildNav', () => {
  it('leads with setup before the book is live, everyday pages disabled', () => {
    const groups = buildNav({ live: false, role: 'owner' });
    expect(groups[0]?.items.map((i) => i.label)).toEqual([
      'Get started',
      'Your workbook',
      'Talk with Cormac',
    ]);
    expect(groups[0]?.items.every((i) => !i.disabled)).toBe(true);

    const book = groups[1];
    expect(book?.label).toBe('Your book');
    expect(book?.items.map((i) => i.label)).toEqual(['Book', 'History']);
    expect(book?.items.every((i) => i.disabled && i.hint === 'Opens after setup')).toBe(true);

    // Structure is meaningless before publish; it must not appear at all.
    expect(destinations(groups)).not.toContain('contract');
  });

  it('leads with the Book once live, setup in a quieter group', () => {
    const groups = buildNav({ live: true, role: 'owner' });
    expect(groups[0]?.items.map((i) => i.label)).toEqual(['Book', 'History']);
    expect(groups[0]?.items.map((i) => i.to)).toEqual(['records', 'audit']);

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

  it('tells non-setup roles where things stand during setup, without the tools', () => {
    for (const role of ['manager', 'member', 'read_only'] as const) {
      const groups = buildNav({ live: false, role });
      expect(groups[0]?.items, role).toEqual([
        { to: 'start', label: 'Get started', hint: 'Setup is underway' },
      ]);
      const dests = destinations(groups);
      expect(dests, role).not.toContain('workbook');
      expect(dests, role).not.toContain('interview');
    }
  });

  it('shows non-setup roles the Structure but not the setup tools once live', () => {
    for (const role of ['manager', 'member', 'read_only'] as const) {
      const groups = buildNav({ live: true, role });
      expect(groups[0]?.items.map((i) => i.to), role).toEqual(['records', 'audit']);
      expect(
        groups[1]?.items.map((i) => i.to),
        role,
      ).toEqual(['contract']);
      const dests = destinations(groups);
      expect(dests, role).not.toContain('workbook');
      expect(dests, role).not.toContain('interview');
    }
  });

  it('keeps task pages (import, inbox) off the rail for every role and stage', () => {
    // Import is a toolbar action on the Book; the old Inbox merged into it.
    for (const role of ROLES) {
      for (const live of [false, true]) {
        const dests = destinations(buildNav({ live, role }));
        expect(dests, `${role} live=${live}`).not.toContain('import');
        expect(dests, `${role} live=${live}`).not.toContain('inbox');
      }
    }
  });

  it('reveals People only to roles that manage members (role-gating hides)', () => {
    for (const role of ROLES) {
      for (const live of [false, true]) {
        const groups = buildNav({ live, role });
        const workspace = groups.find((g) => g.label === 'Workspace');
        if (role === 'owner' || role === 'agent_admin') {
          expect(workspace?.items, `${role} live=${live}`).toEqual([
            { to: 'members', label: 'People', hint: 'Who can work in this book' },
          ]);
        } else {
          expect(workspace, `${role} live=${live}`).toBeUndefined();
        }
      }
    }
  });

  it('never renders a disabled item for role reasons, only for stage reasons', () => {
    // Role-gating hides; disabled items are reserved for "opens after setup".
    for (const role of ROLES) {
      const disabled = buildNav({ live: false, role })
        .flatMap((g) => g.items)
        .filter((i) => i.disabled);
      expect(
        disabled.every((i) => i.hint === 'Opens after setup'),
        role,
      ).toBe(true);
      expect(
        buildNav({ live: true, role })
          .flatMap((g) => g.items)
          .some((i) => i.disabled),
        role,
      ).toBe(false);
    }
  });
});
