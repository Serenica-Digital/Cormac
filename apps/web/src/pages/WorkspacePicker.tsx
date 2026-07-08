import { Navigate, useNavigate } from 'react-router';
import { useWorkspaces } from '../api/hooks';
import { Chip, ErrorNote, Spinner } from '../components/ui';
import { supabase } from '../supabase';

export function WorkspacePicker() {
  const navigate = useNavigate();
  const { data: workspaces, isPending, error } = useWorkspaces();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-stone-400">
        <Spinner />
      </div>
    );
  }

  if (workspaces && workspaces.length === 1) {
    return <Navigate to={`/w/${workspaces[0]!.id}`} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl font-[560] text-ink">Cormac</div>
          <p className="mt-1 text-sm text-stone-500">Choose a workspace</p>
        </div>
        {error && <ErrorNote error={error} />}
        {workspaces && workspaces.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-8 text-center text-sm text-stone-500">
            No workspaces yet. Ask an administrator to add you, or seed one in dev
            (<span className="font-mono text-xs">pnpm seed:ops-e2e</span>).
          </div>
        )}
        <div className="space-y-2">
          {workspaces?.map((w) => (
            <button
              key={w.id}
              onClick={() => navigate(`/w/${w.id}`)}
              className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-ledger-400 hover:bg-ledger-50"
            >
              <span className="text-sm font-medium text-ink">{w.name}</span>
              <Chip tone="neutral">{w.role}</Chip>
            </button>
          ))}
        </div>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="mx-auto mt-8 block text-xs text-stone-400 hover:text-stone-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
