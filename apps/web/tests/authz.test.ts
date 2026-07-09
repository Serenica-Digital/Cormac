import { describe, expect, it } from 'vitest';
import { ROLES } from '@cormac/authz';
import { ROLE_LABELS, roleOrFloor } from '../src/lib/authz';

describe('web authz vocabulary', () => {
  it('gives every role a client label and blurb', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort());
    expect(ROLE_LABELS.owner.label).toBe('Owner');
    expect(ROLE_LABELS.agent_admin.label).toBe('Admin');
    expect(ROLE_LABELS.manager.label).toBe('Manager');
    expect(ROLE_LABELS.member.label).toBe('Member');
    // Client word for read_only is Viewer; the api name never reaches the UI.
    expect(ROLE_LABELS.read_only.label).toBe('Viewer');
    for (const role of ROLES) {
      expect(ROLE_LABELS[role].blurb.length).toBeGreaterThan(0);
    }
  });

  it('floors unknown roles to read_only: show less, never more', () => {
    expect(roleOrFloor('owner')).toBe('owner');
    expect(roleOrFloor('manager')).toBe('manager');
    expect(roleOrFloor('superuser')).toBe('read_only');
    expect(roleOrFloor(undefined)).toBe('read_only');
    expect(roleOrFloor(null)).toBe('read_only');
  });
});
