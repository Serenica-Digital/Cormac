// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Role } from '../src/lib/authz';
import type { WorkspaceMemberRow } from '../src/api/types';

const MEMBERS: WorkspaceMemberRow[] = [
  { userId: 'u-owner', email: 'owner@demo.test', role: 'owner', createdAt: '2026-07-01T12:00:00Z' },
  {
    userId: 'u-admin',
    email: 'admin@demo.test',
    role: 'agent_admin',
    createdAt: '2026-07-02T12:00:00Z',
  },
  {
    userId: 'u-member',
    email: 'member@demo.test',
    role: 'member',
    createdAt: '2026-07-03T12:00:00Z',
  },
];

const mocks = vi.hoisted(() => ({
  myRole: 'owner' as Role,
  meId: 'u-owner',
}));

vi.mock('../src/api/hooks', () => ({
  useMe: () => ({ data: { userId: mocks.meId, email: 'me@demo.test', platformAdmin: false } }),
  useMembers: () => ({ data: MEMBERS, isPending: false, error: null }),
  useWorkspaces: () => ({
    data: [{ id: 'ws1', name: 'Demo', role: mocks.myRole }],
    isPending: false,
  }),
  useAddMember: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useChangeMemberRole: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    variables: undefined,
  }),
  useRemoveMember: () => ({ mutate: vi.fn(), isPending: false, error: null, variables: undefined }),
}));

import { Members } from '../src/pages/Members';

function renderMembers() {
  return render(
    <MemoryRouter initialEntries={['/w/ws1/members']}>
      <Routes>
        <Route path="/w/:workspaceId/members" element={<Members />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Members page', () => {
  // RTL auto-cleanup needs vitest globals, which this suite does not use.
  afterEach(cleanup);

  it('shows the people list with client role words to an owner', () => {
    mocks.myRole = 'owner';
    renderMembers();
    expect(screen.getByText('People')).toBeDefined();
    expect(screen.getByText('owner@demo.test')).toBeDefined();
    expect(screen.getByText('member@demo.test')).toBeDefined();
    // The invite form is present.
    expect(screen.getByLabelText('Add someone by email')).toBeDefined();
    // My own row is marked and locked, not a control.
    expect(screen.getByText('(you)')).toBeDefined();
  });

  it('keeps the last owner protected: no Remove on the sole owner row', () => {
    mocks.myRole = 'owner';
    renderMembers();
    // Two removable rows (admin + member); the sole owner (self) gets none.
    expect(screen.getAllByText('Remove')).toHaveLength(2);
  });

  it('turns non-managers away with context, not controls', () => {
    mocks.myRole = 'manager';
    renderMembers();
    expect(screen.getByText('Nothing to manage here')).toBeDefined();
    expect(screen.queryByLabelText('Add someone by email')).toBeNull();
  });
});
