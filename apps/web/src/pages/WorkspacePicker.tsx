import { Link, Navigate, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { useMe, useWorkspaces } from '../api/hooks';
import { roleLabel } from '../lib/authz';
import { ErrorNote, Spinner } from '../components/kit';
import { supabase } from '../supabase';

export function WorkspacePicker() {
  const navigate = useNavigate();
  const { data: workspaces, isPending, error } = useWorkspaces();
  const me = useMe();

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-stone-400">
        <Spinner />
      </div>
    );
  }

  if (workspaces && workspaces.length === 1) {
    return <Navigate to={`/w/${workspaces[0]!.id}`} replace />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl font-[560] text-ink">Cormac</div>
          <p className="mt-1 text-sm text-stone-500">Choose a workspace</p>
        </div>
        {error && <ErrorNote error={error} />}
        {workspaces && workspaces.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-card px-6 py-8 text-center text-sm text-stone-500">
            No workspaces yet. Ask your administrator to add you.
            {import.meta.env.DEV && (
              <span className="mt-1 block text-xs text-stone-400">
                (dev: <span className="font-mono">pnpm seed:ops-e2e</span>)
              </span>
            )}
          </div>
        )}
        <div className="space-y-2">
          {workspaces?.map((w) => (
            <button
              key={w.id}
              onClick={() => navigate(`/w/${w.id}`)}
              className="flex w-full items-center justify-between rounded-lg bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-all hover:bg-ledger-50 hover:ring-ledger-400"
            >
              <span className="text-sm font-medium text-ink">{w.name}</span>
              <Badge variant="neutral">{roleLabel(w.role)}</Badge>
            </button>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-4">
          {me.data?.platformAdmin && (
            <Link to="/operator" className="text-xs text-stone-400 hover:text-stone-600">
              Operator console
            </Link>
          )}
          <button
            onClick={() => void supabase.auth.signOut()}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
