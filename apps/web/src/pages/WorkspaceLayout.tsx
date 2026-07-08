import { NavLink, Outlet, useParams, Link } from 'react-router';
import { useWorkspaces } from '../api/hooks';
import { useSession } from '../auth/useSession';
import { supabase } from '../supabase';

const NAV = [
  { to: 'interview', label: 'Interview', hint: 'Author the contract' },
  { to: 'workbook', label: 'Workbook', hint: 'Upload and preview' },
  { to: 'inbox', label: 'Inbox', hint: 'Capture and review' },
  { to: 'records', label: 'Records', hint: 'The book' },
  { to: 'contract', label: 'Contract', hint: 'The published truth' },
  { to: 'audit', label: 'Audit', hint: 'Every change, kept' },
];

export function WorkspaceLayout() {
  const { workspaceId = '' } = useParams();
  const { data: workspaces } = useWorkspaces();
  const { session } = useSession();
  const workspace = workspaces?.find((w) => w.id === workspaceId);

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="fixed inset-y-0 flex w-60 flex-col border-r border-stone-200 bg-white/70 backdrop-blur">
        <div className="px-5 pt-5 pb-4">
          <Link to="/" className="font-display text-[22px] font-[560] text-ink">
            Cormac
          </Link>
          <div className="mt-0.5 truncate text-xs text-stone-400">
            {workspace?.name ?? 'workspace'}
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group block rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-ledger-50 font-medium text-ledger-800'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-ink'
                }`
              }
            >
              <span className="block">{item.label}</span>
              <span className="block text-[11px] font-normal text-stone-400 group-hover:text-stone-500">
                {item.hint}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-stone-200 px-5 py-4">
          <div className="truncate text-xs text-stone-500">{session?.user.email}</div>
          <button
            onClick={() => void supabase.auth.signOut()}
            className="mt-1 text-xs text-stone-400 hover:text-stone-600"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="ml-60 flex-1">
        <div className="mx-auto max-w-4xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
