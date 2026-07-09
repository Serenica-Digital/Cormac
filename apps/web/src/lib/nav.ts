import { can, type Role } from '@cormac/authz';

/**
 * The sidebar's story depends on where the workspace is AND who is looking.
 * Before the structure is live, setup leads and the everyday pages wait;
 * after, everyday work leads and setup recedes into a quieter group.
 *
 * Two gating conventions, deliberately different: stage-gating DISABLES
 * (the pages exist, they open after setup - worth showing), role-gating
 * HIDES (a viewer never learns member management exists). Pure so tests can
 * pin the copy. Presentation only; the server enforces authority.
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

export function buildNav({ live, role }: { live: boolean; role: Role }): NavGroup[] {
  const groups: NavGroup[] = [];
  const runsSetup = can(role, 'publish_contract');

  if (!live) {
    groups.push({
      items: runsSetup
        ? [
            { to: 'start', label: 'Get started', hint: 'Set up your book' },
            { to: 'workbook', label: 'Your workbook', hint: 'The spreadsheet you run on' },
            { to: 'interview', label: 'Talk with Cormac', hint: 'Set up in one conversation' },
          ]
        : [{ to: 'start', label: 'Get started', hint: 'Setup is underway' }],
    });
    groups.push({
      label: 'Your book',
      items: [
        { to: 'inbox', label: 'Inbox', hint: 'Opens after setup', disabled: true },
        { to: 'records', label: 'Records', hint: 'Opens after setup', disabled: true },
        { to: 'audit', label: 'History', hint: 'Opens after setup', disabled: true },
      ],
    });
  } else {
    groups.push({
      items: [
        { to: 'inbox', label: 'Inbox', hint: 'Tell Cormac what happened' },
        { to: 'records', label: 'Records', hint: 'Your book, up to date' },
        { to: 'audit', label: 'History', hint: 'Every change, kept' },
      ],
    });
    groups.push({
      label: 'Setup',
      items: runsSetup
        ? [
            { to: 'contract', label: 'Structure', hint: 'How your book is organized' },
            { to: 'workbook', label: 'Your workbook', hint: 'The spreadsheet you shared' },
            { to: 'interview', label: 'Talk with Cormac', hint: 'Revisit the setup conversation' },
          ]
        : [{ to: 'contract', label: 'Structure', hint: 'How your book is organized' }],
    });
  }

  if (can(role, 'manage_members')) {
    groups.push({
      label: 'Workspace',
      items: [{ to: 'members', label: 'People', hint: 'Who can work in this book' }],
    });
  }

  return groups;
}
