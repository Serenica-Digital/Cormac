import { can, type Role } from '@cormac/authz';

/**
 * One flat nav, the same shape at every stage: the Book (where you work),
 * History (what happened), Structure (how it's organized), People (who's in
 * it). Setup is not a wing; it is the Book's own early life, so pre-live the
 * Book leads and the reference pages wait.
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
  const items: NavItem[] = live
    ? [
        { to: 'records', label: 'Book', hint: 'Your records, beside Cormac' },
        { to: 'audit', label: 'History', hint: 'Every change, kept' },
        { to: 'contract', label: 'Structure', hint: 'How your book is organized' },
      ]
    : [
        {
          to: 'records',
          label: 'Book',
          hint: can(role, 'publish_contract')
            ? 'Set it up with Cormac'
            : 'Setup is underway',
        },
        { to: 'audit', label: 'History', hint: 'Opens after setup', disabled: true },
        { to: 'contract', label: 'Structure', hint: 'Opens after setup', disabled: true },
      ];

  if (can(role, 'manage_members')) {
    items.push({ to: 'members', label: 'People', hint: 'Who can work in this book' });
  }

  return [{ items }];
}
