import { useEffect, useRef, useState } from 'react';
import { ui } from '../ui';
import {
  clearHighlight,
  highlightRange,
  readWorkbookSummary,
  startOnChangedLog,
  type ChangeEvent,
  type WorkbookSummary,
} from './workbook';

/** A stand-in for an agent-proposed contract, so Probe D can demonstrate the
 * draft-review panel pointing at real columns in the open workbook. */
const DRAFT_FIELDS = [
  { label: 'Contact name', column: 'A' },
  { label: 'Company', column: 'B' },
  { label: 'Status', column: 'C' },
  { label: 'Last touch', column: 'D' },
];

export function WorkbookProbePanel() {
  const [summary, setSummary] = useState<WorkbookSummary | null>(null);
  const [addr, setAddr] = useState('A1:A20');
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => () => void stopRef.current?.(), []);

  function guard(fn: () => Promise<void>) {
    return async () => {
      try {
        setError(null);
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
  }

  const readSummary = guard(async () => setSummary(await readWorkbookSummary()));
  const highlight = guard(() => highlightRange(addr));
  const clear = guard(() => clearHighlight(addr));

  async function toggleLog() {
    try {
      setError(null);
      if (logging) {
        await stopRef.current?.();
        stopRef.current = null;
        setLogging(false);
      } else {
        stopRef.current = await startOnChangedLog((e) => setEvents((prev) => [e, ...prev]));
        setLogging(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      {error && <div style={ui.error}>{error}</div>}

      <section style={ui.card}>
        <h2 style={ui.h2}>Probe C · workbook read latency</h2>
        <button style={ui.button} onClick={readSummary}>
          Read workbook summary
        </button>
        {summary && (
          <>
            <p style={{ ...ui.muted, margin: '8px 0' }}>
              {summary.syncCount} syncs · {summary.totalSyncMs} ms total · {summary.totalCells} cells ·{' '}
              {(summary.approxBytes / 1_000_000).toFixed(2)} MB approx
            </p>
            <table style={ui.table}>
              <thead>
                <tr>
                  <th style={ui.th}>sheet</th>
                  <th style={ui.th}>rows×cols</th>
                  <th style={ui.th}>address</th>
                  <th style={ui.th}>KB</th>
                </tr>
              </thead>
              <tbody>
                {summary.sheets.map((s, i) => (
                  <tr key={i}>
                    <td style={ui.td}>{s.name}</td>
                    <td style={ui.td}>
                      {s.rowCount}×{s.colCount}
                    </td>
                    <td style={ui.td}>{s.error ? `⚠ ${s.error}` : s.address}</td>
                    <td style={ui.td}>{(s.approxBytes / 1000).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section style={ui.card}>
        <h2 style={ui.h2}>Probe D · highlight + draft review</h2>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input style={ui.input} value={addr} onChange={(e) => setAddr(e.target.value)} />
          <button style={ui.button} onClick={highlight}>
            Highlight
          </button>
          <button style={ui.button} onClick={clear}>
            Clear
          </button>
        </div>
        <div style={{ ...ui.card, marginBottom: 0, background: '#fafafa' }}>
          <strong>Proposed: Contacts</strong>
          <p style={{ ...ui.muted, margin: '4px 0' }}>
            Tap a field to point the pane at its column in the open sheet.
          </p>
          {DRAFT_FIELDS.map((f) => (
            <button
              key={f.column}
              style={{ ...ui.button, marginBottom: 4 }}
              onClick={guard(() => highlightRange(`${f.column}1:${f.column}50`))}
            >
              {f.label} → col {f.column}
            </button>
          ))}
        </div>
      </section>

      <section style={ui.card}>
        <h2 style={ui.h2}>Probe E · onChanged reliability</h2>
        <button style={ui.button} onClick={toggleLog}>
          {logging ? 'Stop change log' : 'Start change log'}
        </button>
        <p style={{ ...ui.muted, margin: '8px 0' }}>
          Edit a cell, then change a data-validation dropdown, then paste. Watch which fire and the
          source (Local vs Remote). The dropdown case is the known web gap.
        </p>
        {events.length > 0 && (
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>t (ms)</th>
                <th style={ui.th}>address</th>
                <th style={ui.th}>changeType</th>
                <th style={ui.th}>source</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td style={ui.td}>{e.atMs}</td>
                  <td style={ui.td}>{e.address}</td>
                  <td style={ui.td}>{e.changeType}</td>
                  <td style={ui.td}>{e.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
