import { Link, Navigate, useNavigate } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import type { Contract } from '@cormac/contract';
import { Badge } from '@/components/ui/badge';
import { api } from '../api/client';
import { useMe, useWorkspaces } from '../api/hooks';
import { roleLabel } from '../lib/authz';
import { ErrorNote, Spinner } from '../components/kit';
import { supabase } from '../supabase';

type Stage = 'live' | 'setup' | 'unknown';

export function WorkspacePicker() {
  const navigate = useNavigate();
  const { data: workspaces, isPending, error } = useWorkspaces();
  const me = useMe();

  // A workspace is "live" once it has a published contract. Same cache key as
  // useContract, so landing in the workspace reuses the answer.
  const contracts = useQueries({
    queries: (workspaces ?? []).map((w) => ({
      queryKey: ['contract', w.id],
      queryFn: () =>
        api.get<{ contract: Contract; version: number }>(`/api/workspaces/${w.id}/contract`),
      retry: false,
    })),
  });
  const stageOf = (i: number): Stage => {
    const q = contracts[i];
    if (!q || q.isPending) return 'unknown';
    return q.data ? 'live' : 'setup';
  };

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

  // Live books first: that's where the work is. Setup follows; ties by name.
  const order: Record<Stage, number> = { live: 0, unknown: 1, setup: 2 };
  const sorted = (workspaces ?? [])
    .map((w, i) => ({ ...w, stage: stageOf(i) }))
    .sort((a, b) => order[a.stage] - order[b.stage] || a.name.localeCompare(b.name));

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
          {sorted.map((w) => (
            <button
              key={w.id}
              onClick={() => navigate(`/w/${w.id}`)}
              className="flex w-full items-center gap-2 rounded-lg bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-all hover:bg-ledger-50 hover:ring-ledger-400"
            >
              <span className="text-sm font-medium text-ink">{w.name}</span>
              {w.stage === 'live' && <Badge variant="applied">Live</Badge>}
              {w.stage === 'setup' && <Badge variant="pending">Setting up</Badge>}
              <Badge variant="neutral" className="ml-auto">
                {roleLabel(w.role)}
              </Badge>
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
