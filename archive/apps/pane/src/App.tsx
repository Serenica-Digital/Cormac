import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthPanel } from './auth/AuthPanel';
import { detectPlatform, platformLabel } from './platform';
import { inExcel } from './office';
import { SseProbePanel } from './probe/SseProbePanel';
import { WorkbookProbePanel } from './probe/WorkbookProbePanel';
import { currentRoute, navigate, onRouteChange, type Route } from './router';
import { supabase } from './supabase';
import { ui } from './ui';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(currentRoute());
  const [error, setError] = useState<string | null>(null);
  const platform = detectPlatform();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setWorkspaceId(null);
    });
    const off = onRouteChange(() => setRoute(currentRoute()));
    return () => {
      sub.subscription.unsubscribe();
      off();
    };
  }, []);

  // Resolve the user's first workspace (RLS returns only their own), exactly as
  // apps/web does. The probes need a workspace id for the SSE path.
  useEffect(() => {
    if (!session) return;
    void supabase
      .from('memberships')
      .select('workspace_id')
      .limit(1)
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else if (data?.[0]) setWorkspaceId(data[0].workspace_id as string);
        else setError('Not a member of any workspace. Run pnpm seed.');
      });
  }, [session]);

  return (
    <div style={ui.page}>
      <header style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Cormac pane spike</h1>
          <span style={ui.muted}>{platformLabel(platform)}</span>
        </div>
        <p style={{ ...ui.muted, margin: '4px 0' }}>
          host: {inExcel() ? 'Excel' : 'not in Excel'} · user:{' '}
          <span style={ui.mono}>{session?.user.id ?? '(signed out)'}</span>
        </p>
        <div>
          <button
            style={{ ...ui.button, background: route === 'auth' ? '#eef' : '#fff' }}
            onClick={() => navigate('auth')}
          >
            Sign in (Probe B)
          </button>
          <button
            style={{ ...ui.button, background: route === 'probes' ? '#eef' : '#fff' }}
            onClick={() => navigate('probes')}
          >
            Probes A/C/D/E
          </button>
          {session && (
            <button style={ui.button} onClick={() => void supabase.auth.signOut()}>
              Sign out
            </button>
          )}
        </div>
      </header>

      {error && <div style={ui.error}>{error}</div>}

      {route === 'probes' ? (
        session && workspaceId ? (
          <>
            <SseProbePanel workspaceId={workspaceId} />
            <WorkbookProbePanel />
          </>
        ) : (
          <section style={ui.card}>
            <p style={ui.muted}>
              {session ? 'Resolving workspace…' : 'Sign in first (Lane 0 needs no Azure).'}
            </p>
          </section>
        )
      ) : (
        <AuthPanel platform={platform} />
      )}
    </div>
  );
}
