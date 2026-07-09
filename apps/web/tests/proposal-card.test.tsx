// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Contract } from '@cormac/contract';
import { ProposalCard } from '../src/components/ProposalCard';
import type { ProposalView } from '../src/api/types';

const contract = {
  name: 'Test book',
  version: 1,
  objects: [
    {
      objectId: 'o1',
      apiName: 'contact',
      label: 'Contact',
      identity: { displayFields: ['name'] },
      aliases: [],
      fields: [
        {
          fieldId: 'f1',
          apiName: 'name',
          label: 'Name',
          type: 'string',
          required: true,
          editableByUser: true,
          editableByAgent: true,
          sensitive: false,
        },
        {
          fieldId: 'f2',
          apiName: 'status',
          label: 'Deal Status',
          type: 'enum',
          enumOptions: ['open', 'closed'],
          required: false,
          editableByUser: true,
          editableByAgent: true,
          sensitive: false,
        },
      ],
    },
  ],
  glossary: [],
} as unknown as Contract;

const proposal: ProposalView = {
  id: 'p1',
  status: 'pending',
  createdAt: '2026-07-08T12:00:00Z',
  sourceMessageId: 'm1',
  uncertain: true,
  notes: 'Assumed Carter means the Carter Group deal.',
  changes: [
    {
      objectApiName: 'contact',
      op: 'update',
      recordId: 'r1',
      values: { status: 'closed' },
      current: { name: 'Carter', status: 'open' },
    },
  ],
};

describe('ProposalCard', () => {
  // RTL auto-cleanup needs vitest globals, which this suite does not use.
  afterEach(cleanup);

  it('renders the diff (current struck through, proposed highlighted) with contract labels', () => {
    render(
      <MemoryRouter>
        <ProposalCard proposal={proposal} contract={contract} workspaceId="ws1" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Deal Status')).toBeDefined();
    expect(screen.getByText('open')).toBeDefined();
    expect(screen.getByText('closed')).toBeDefined();
    expect(screen.getByText(/uncertain/)).toBeDefined();
    expect(screen.getByText(/Assumed Carter/)).toBeDefined();
    expect(screen.getByText('Contact')).toBeDefined();
  });

  it('shows approve/reject only while pending, and wires the decision', () => {
    const onDecide = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <ProposalCard
          proposal={proposal}
          contract={contract}
          workspaceId="ws1"
          onDecide={onDecide}
        />
      </MemoryRouter>,
    );
    screen.getByText('Approve').click();
    expect(onDecide).toHaveBeenCalledWith('approve');

    rerender(
      <MemoryRouter>
        <ProposalCard
          proposal={{ ...proposal, status: 'applied' }}
          contract={contract}
          workspaceId="ws1"
          onDecide={onDecide}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Approve')).toBeNull();
  });

  it('tells non-deciders a pending proposal is waiting, without dead buttons', () => {
    render(
      <MemoryRouter>
        <ProposalCard proposal={proposal} contract={contract} workspaceId="ws1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Waiting for a manager's approval.")).toBeDefined();
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });
});
