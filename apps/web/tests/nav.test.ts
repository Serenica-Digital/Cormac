import { describe, expect, it } from 'vitest';
import { ROLES } from '@cormac/authz';
import { buildNav } from '@/lib/nav';

const items = (groups: ReturnType<typeof buildNav>) => groups.flatMap((g) => g.items);
const destinations = (groups: ReturnType<typeof buildNav>) => items(groups).map((i) => i.to);

describe('buildNav', () => {
  it('is one flat group with the same shape at every stage', () => {
    for (const role of ROLES) {
      for (const live of [false, true]) {
        const groups = buildNav({ live, role });
        expect(groups, `${role} live=${live}`).toHaveLength(1);
        expect(groups[0]?.label, `${role} live=${live}`).toBeUndefined();
        const dests = destinations(groups);
        expect(dests.slice(0, 3), `${role} live=${live}`).toEqual([
          'records',
          'audit',
          'contract',
        ]);
      }
    }
  });

  it('leads with the Book; reference pages open after setup', () => {
    const before = items(buildNav({ live: false, role: 'owner' }));
    expect(before.map((i) => i.label)).toEqual(['Book', 'History', 'Structure', 'People']);
    expect(before[0]?.disabled).toBeUndefined();
    expect(before[0]?.hint).toBe('Set it up with Cormac');
    expect(before.slice(1, 3).every((i) => i.disabled && i.hint === 'Opens after setup')).toBe(
      true,
    );

    const after = items(buildNav({ live: true, role: 'owner' }));
    expect(after.every((i) => !i.disabled)).toBe(true);
    expect(after.map((i) => i.label)).toEqual(['Book', 'History', 'Structure', 'People']);
  });

  it('tells non-setup roles where things stand, without the tools', () => {
    for (const role of ['manager', 'member', 'read_only'] as const) {
      const before = items(buildNav({ live: false, role }));
      expect(before[0]?.hint, role).toBe('Setup is underway');
    }
  });

  it('keeps dissolved pages (inbox, import, workbook, interview, start) off the rail', () => {
    for (const role of ROLES) {
      for (const live of [false, true]) {
        const dests = destinations(buildNav({ live, role }));
        for (const gone of ['inbox', 'import', 'workbook', 'interview', 'start']) {
          expect(dests, `${role} live=${live}`).not.toContain(gone);
        }
      }
    }
  });

  it('reveals People only to roles that manage members (role-gating hides)', () => {
    for (const role of ROLES) {
      for (const live of [false, true]) {
        const dests = destinations(buildNav({ live, role }));
        expect(dests.includes('members'), `${role} live=${live}`).toBe(
          role === 'owner' || role === 'agent_admin',
        );
      }
    }
  });

  it('never renders a disabled item for role reasons, only for stage reasons', () => {
    for (const role of ROLES) {
      const disabled = items(buildNav({ live: false, role })).filter((i) => i.disabled);
      expect(
        disabled.every((i) => i.hint === 'Opens after setup'),
        role,
      ).toBe(true);
      expect(
        items(buildNav({ live: true, role })).some((i) => i.disabled),
        role,
      ).toBe(false);
    }
  });
});
