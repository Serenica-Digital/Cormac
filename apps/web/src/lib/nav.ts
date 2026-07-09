/**
 * The sidebar's story depends on where the workspace is. Before the structure
 * is live, setup leads and the everyday pages wait; after, everyday work
 * leads and setup recedes into a quieter group. Pure so tests can pin the
 * copy.
 */
export interface NavItem {
  to: string;
  label: string;
  hint: string;
  disabled?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function buildNav({ live }: { live: boolean }): NavGroup[] {
  if (!live) {
    return [
      {
        items: [
          { to: 'start', label: 'Get started', hint: 'Set up your book' },
          { to: 'workbook', label: 'Your workbook', hint: 'The spreadsheet you run on' },
          { to: 'interview', label: 'Talk with Cormac', hint: 'Set up in one conversation' },
        ],
      },
      {
        label: 'Your book',
        items: [
          { to: 'inbox', label: 'Inbox', hint: 'Opens after setup', disabled: true },
          { to: 'records', label: 'Records', hint: 'Opens after setup', disabled: true },
          { to: 'audit', label: 'History', hint: 'Opens after setup', disabled: true },
        ],
      },
    ];
  }
  return [
    {
      items: [
        { to: 'inbox', label: 'Inbox', hint: 'Tell Cormac what happened' },
        { to: 'records', label: 'Records', hint: 'Your book, up to date' },
        { to: 'audit', label: 'History', hint: 'Every change, kept' },
      ],
    },
    {
      label: 'Setup',
      items: [
        { to: 'contract', label: 'Structure', hint: 'How your book is organized' },
        { to: 'workbook', label: 'Your workbook', hint: 'The spreadsheet you shared' },
        { to: 'interview', label: 'Talk with Cormac', hint: 'Revisit the setup conversation' },
      ],
    },
  ];
}
