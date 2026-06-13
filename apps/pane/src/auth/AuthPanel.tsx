import { useMemo, useRef, useState } from 'react';
import { ui } from '../ui';
import { platformLabel } from '../platform';
import { dialogLane } from './dialog';
import { naaLane } from './msal';
import { passwordLane } from './password';
import type { FailureMode, LaneId, Platform, SignInLane } from './lanes';

interface LaneResult {
  laneId: LaneId;
  ok: boolean;
  userId?: string;
  failureMode?: FailureMode;
  detail?: string;
  at: string;
}

/**
 * Offers the three sign-in lanes through the one SignInLane contract and records
 * each outcome. Probe B's verdict falls out of the records: when two or more
 * lanes succeed, do their Supabase user.ids match? Same id means Microsoft links
 * onto the existing auth.users row (identity-linking Option a); different ids
 * means escalate to Option b. The comparison is apples-to-apples because every
 * lane converges on the same shared client.
 */
export function AuthPanel({ platform }: { platform: Platform }) {
  const [email, setEmail] = useState('owner@demo.cormac.test');
  const [password, setPassword] = useState('demo-password-123');
  const [busy, setBusy] = useState<LaneId | null>(null);
  const [results, setResults] = useState<LaneResult[]>([]);

  // A ref so the password lane's getter always reads the latest input without
  // rebuilding the lane list on each keystroke.
  const credsRef = useRef({ email, password });
  credsRef.current = { email, password };

  const lanes = useMemo<SignInLane[]>(
    () => [passwordLane(() => credsRef.current), naaLane(() => platform), dialogLane()],
    [platform],
  );

  async function run(lane: SignInLane) {
    setBusy(lane.id);
    const outcome = await lane.signIn();
    setResults((prev) => [
      {
        laneId: lane.id,
        ok: outcome.ok,
        userId: outcome.ok ? outcome.session.user.id : undefined,
        failureMode: outcome.ok ? undefined : outcome.failureMode,
        detail: outcome.ok ? undefined : outcome.detail,
        at: new Date().toLocaleTimeString(),
      },
      ...prev,
    ]);
    setBusy(null);
  }

  const successes = results.filter((r) => r.ok && r.userId);
  const lanesSucceeded = new Set(successes.map((r) => r.laneId));
  const distinctIds = new Set(successes.map((r) => r.userId));
  const verdict =
    lanesSucceeded.size >= 2
      ? distinctIds.size === 1
        ? 'SAME auth.users row across lanes — identity-linking Option (a) holds.'
        : 'DIFFERENT auth.users rows — escalate to Option (b).'
      : null;

  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>Probe B · sign-in lanes ({platformLabel(platform)})</h2>

      <div style={{ marginBottom: 10 }}>
        <input
          style={{ ...ui.input, marginBottom: 6 }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email (Lane 0)"
        />
        <input
          style={ui.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password (Lane 0)"
        />
      </div>

      {lanes.map((lane) => {
        const available = lane.available(platform);
        return (
          <div key={lane.id} style={{ borderTop: '1px solid #eee', paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{lane.label}</strong>
              <span style={{ ...ui.pill, background: available ? '#e6f4ea' : '#f3f3f3' }}>
                {available ? 'available' : 'unavailable'}
              </span>
            </div>
            <p style={{ ...ui.muted, margin: '4px 0' }}>{lane.description}</p>
            <button
              style={ui.button}
              disabled={!available || busy !== null}
              onClick={() => void run(lane)}
            >
              {busy === lane.id ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        );
      })}

      {verdict && (
        <div style={{ ...ui.card, marginTop: 12, background: distinctIds.size === 1 ? '#e6f4ea' : '#fde8e8' }}>
          <strong>Probe B verdict:</strong> {verdict}
        </div>
      )}

      {results.length > 0 && (
        <table style={{ ...ui.table, marginTop: 12 }}>
          <thead>
            <tr>
              <th style={ui.th}>at</th>
              <th style={ui.th}>lane</th>
              <th style={ui.th}>result</th>
              <th style={ui.th}>user.id / failure</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td style={ui.td}>{r.at}</td>
                <td style={ui.td}>{r.laneId}</td>
                <td style={{ ...ui.td, ...(r.ok ? ui.ok : ui.bad) }}>{r.ok ? 'ok' : 'fail'}</td>
                <td style={{ ...ui.td, ...ui.mono }}>
                  {r.ok ? r.userId : `${r.failureMode}${r.detail ? `: ${r.detail}` : ''}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
