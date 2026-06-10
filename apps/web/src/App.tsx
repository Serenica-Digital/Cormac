import { useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  type AuditRow,
  type ProposalView,
  type RecordRow,
} from './api';
import { supabase } from './supabase';

interface Session {
  token: string;
  email: string;
}

const ui = {
  page: { maxWidth: 860, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' },
  card: { border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 },
  h2: { fontSize: 16, margin: '0 0 12px', textTransform: 'uppercase' as const, letterSpacing: 1 },
  button: { padding: '6px 12px', borderRadius: 6, border: '1px solid #888', cursor: 'pointer' },
  input: { padding: 8, borderRadius: 6, border: '1px solid #bbb', width: '100%', boxSizing: 'border-box' as const },
  error: { background: '#fde8e8', color: '#9b1c1c', padding: 12, borderRadius: 6, marginBottom: 16 },
  pill: { fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#eef', marginLeft: 8 },
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (s) setSession({ token: s.access_token, email: s.user.email ?? '' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ? { token: s.access_token, email: s.user.email ?? '' } : null);
      if (!s) setWorkspaceId(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Pick the user's first workspace once signed in (RLS returns only their own).
  useEffect(() => {
    if (!session) return;
    supabase
      .from('memberships')
      .select('workspace_id')
      .limit(1)
      .then(({ data, error: e }) => {
        const first = data?.[0];
        if (e) setError(e.message);
        else if (first) setWorkspaceId(first.workspace_id as string);
        else setError('You are not a member of any workspace. Run the seed script.');
      });
  }, [session]);

  if (!session) return <Login onError={setError} error={error} />;

  return (
    <div style={ui.page}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22 }}>Cormac</h1>
        <div>
          <span style={{ marginRight: 12, color: '#555' }}>{session.email}</span>
          <button style={ui.button} onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      {error && <div style={ui.error}>{error}</div>}
      {workspaceId ? (
        <Workspace token={session.token} workspaceId={workspaceId} onError={setError} />
      ) : (
        <p>Loading workspace…</p>
      )}
    </div>
  );
}

function Login({ error, onError }: { error: string | null; onError: (e: string | null) => void }) {
  const [email, setEmail] = useState('owner@demo.serenica.test');
  const [password, setPassword] = useState('demo-password-123');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    onError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) onError(e.message);
    setBusy(false);
  }

  return (
    <div style={{ ...ui.page, maxWidth: 360 }}>
      <h1 style={{ fontSize: 22 }}>Cormac</h1>
      {error && <div style={ui.error}>{error}</div>}
      <div style={ui.card}>
        <p style={{ marginTop: 0, color: '#555' }}>Sign in with the seeded demo user.</p>
        <input style={{ ...ui.input, marginBottom: 8 }} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          style={{ ...ui.input, marginBottom: 12 }}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button style={ui.button} disabled={busy} onClick={signIn}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}

function Workspace({
  token,
  workspaceId,
  onError,
}: {
  token: string;
  workspaceId: string;
  onError: (e: string | null) => void;
}) {
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const base = `/api/workspaces/${workspaceId}`;

  const refresh = useCallback(async () => {
    try {
      const [p, r, a] = await Promise.all([
        apiFetch<{ proposals: ProposalView[] }>(`${base}/proposals`, token),
        apiFetch<{ records: RecordRow[] }>(`${base}/records`, token),
        apiFetch<{ events: AuditRow[] }>(`${base}/audit`, token),
      ]);
      setProposals(p.proposals);
      setRecords(r.records);
      setAudit(a.events);
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [base, token, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function capture() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`${base}/capture`, token, { method: 'POST', body: { text } });
      setText('');
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function decide(proposalId: string, decision: 'approve' | 'reject') {
    setBusy(true);
    try {
      await apiFetch(`${base}/proposals/${proposalId}/decision`, token, {
        method: 'POST',
        body: { decision },
      });
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const pending = proposals.filter((p) => p.status === 'pending');

  return (
    <>
      <section style={ui.card}>
        <h2 style={ui.h2}>Tell the CRM what happened</h2>
        <textarea
          style={{ ...ui.input, minHeight: 70, marginBottom: 8 }}
          placeholder="e.g. Talked to John about the waterfront deal, he's interested."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button style={ui.button} disabled={busy} onClick={capture}>
          {busy ? 'Working…' : 'Send'}
        </button>
      </section>

      <section style={ui.card}>
        <h2 style={ui.h2}>Review queue ({pending.length})</h2>
        {pending.length === 0 && <p style={{ color: '#777' }}>No proposals waiting.</p>}
        {pending.map((p) => (
          <div key={p.id} style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 12 }}>
            {p.uncertain && <span style={ui.pill}>uncertain</span>}
            {p.changes.map((c, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <strong>
                  {c.op} {c.objectApiName}
                </strong>
                <ul style={{ margin: '4px 0' }}>
                  {Object.entries(c.values).map(([k, v]) => (
                    <li key={k}>
                      {k}: <em>{format(c.current?.[k])}</em> → <strong>{format(v)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <button style={{ ...ui.button, marginRight: 8 }} disabled={busy} onClick={() => decide(p.id, 'approve')}>
              Approve
            </button>
            <button style={ui.button} disabled={busy} onClick={() => decide(p.id, 'reject')}>
              Reject
            </button>
          </div>
        ))}
      </section>

      <section style={ui.card}>
        <h2 style={ui.h2}>Records ({records.length})</h2>
        {records.map((r) => (
          <div key={r.id} style={{ borderTop: '1px solid #eee', paddingTop: 8, marginTop: 8 }}>
            <strong>{r.object_api_name}</strong>
            <pre style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.data, null, 2)}</pre>
          </div>
        ))}
      </section>

      <section style={ui.card}>
        <h2 style={ui.h2}>Audit ({audit.length})</h2>
        {audit.map((e) => (
          <div key={e.id} style={{ fontSize: 13, color: '#555', borderTop: '1px solid #eee', padding: '6px 0' }}>
            <span>{new Date(e.created_at).toLocaleString()}</span> · <strong>{e.action}</strong> ·{' '}
            {e.actor_type} {e.object_api_name ? `· ${e.object_api_name}` : ''}
          </div>
        ))}
      </section>
    </>
  );
}

function format(value: unknown): string {
  if (value === undefined || value === null) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
