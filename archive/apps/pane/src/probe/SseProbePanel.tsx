import { useRef, useState } from 'react';
import { ui } from '../ui';
import { runSseProbe, verdictFor, type SseProbeHandle, type SseRow, type SseVerdict } from './sse';

/**
 * Probe A surface. Runs the SSE capture stream and shows the per-frame arrival
 * table on screen (Mac remote-debugging is awkward; on-screen is the reliable
 * readout). The deltaFromPrev column is the measurement: spaced ~1s deltas mean
 * the webview streamed, one big end gap means it buffered.
 */
export function SseProbePanel({ workspaceId }: { workspaceId: string }) {
  const [text, setText] = useState('Talked to John about the waterfront deal, he is interested.');
  const [rows, setRows] = useState<SseRow[]>([]);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<SseVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<SseProbeHandle | null>(null);

  function start() {
    setRows([]);
    setVerdict(null);
    setError(null);
    setRunning(true);
    handleRef.current = runSseProbe({
      workspaceId,
      text,
      onRow: (r) => setRows((prev) => [...prev, r]),
      onDone: (all) => {
        setVerdict(verdictFor(all));
        setRunning(false);
      },
      onError: (m) => {
        setError(m);
        setRunning(false);
      },
    });
  }

  function stop() {
    handleRef.current?.abort();
    setRunning(false);
  }

  return (
    <section style={ui.card}>
      <h2 style={ui.h2}>Probe A · SSE streaming</h2>
      <textarea
        style={{ ...ui.input, minHeight: 54, marginBottom: 6 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ marginBottom: 8 }}>
        <button style={ui.button} disabled={running} onClick={start}>
          {running ? 'Streaming…' : 'Run Probe A'}
        </button>
        <button style={ui.button} disabled={!running} onClick={stop}>
          Stop
        </button>
      </div>

      {verdict && (
        <div style={{ ...ui.card, background: verdict === 'incremental' ? '#e6f4ea' : '#fff3cd' }}>
          <strong>Verdict:</strong> {verdict}
        </div>
      )}
      {error && <div style={ui.error}>{error}</div>}

      {rows.length > 0 && (
        <table style={ui.table}>
          <thead>
            <tr>
              <th style={ui.th}>seq</th>
              <th style={ui.th}>event</th>
              <th style={ui.th}>t (ms)</th>
              <th style={ui.th}>Δ prev (ms)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={ui.td}>{r.seq}</td>
                <td style={ui.td}>{r.event}</td>
                <td style={ui.td}>{r.clientRecvMs}</td>
                <td style={ui.td}>{r.deltaFromPrevMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
