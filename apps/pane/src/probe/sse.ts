import { fetchEventSource } from '@microsoft/fetch-event-source';
import { supabase } from '../supabase';

/**
 * Probe A: does the Office webview deliver SSE frames incrementally, or buffer
 * them to the end? We measure client inter-arrival deltas; if they track the
 * server's ~1s progress tick the transport is incremental, if they collapse into
 * one gap at the end it buffered. Uses @microsoft/fetch-event-source because it
 * can send the Authorization header (native EventSource cannot).
 */
export interface SseRow {
  seq: number;
  event: string;
  clientRecvMs: number;
  deltaFromPrevMs: number;
}

export type SseVerdict = 'incremental' | 'buffered' | 'inconclusive';

export interface SseProbeHandle {
  abort(): void;
}

export function runSseProbe(opts: {
  workspaceId: string;
  text: string;
  onRow: (row: SseRow) => void;
  onDone: (rows: SseRow[]) => void;
  onError: (message: string) => void;
}): SseProbeHandle {
  const controller = new AbortController();
  const rows: SseRow[] = [];
  let last = performance.now();
  const start = last;

  void (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? '';
    const url = `${import.meta.env.VITE_API_URL}/api/workspaces/${opts.workspaceId}/capture/stream?text=${encodeURIComponent(opts.text)}`;
    try {
      await fetchEventSource(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        openWhenHidden: true,
        onopen: async (res) => {
          if (!res.ok) throw new Error(`stream open failed (${res.status})`);
          last = performance.now();
        },
        onmessage: (ev) => {
          const now = performance.now();
          const row: SseRow = {
            seq: Number(ev.id || rows.length),
            event: ev.event || 'message',
            clientRecvMs: Math.round(now - start),
            deltaFromPrevMs: Math.round(now - last),
          };
          last = now;
          rows.push(row);
          opts.onRow(row);
          if (ev.event === 'done') opts.onDone(rows);
        },
        onerror: (err) => {
          // Throw to stop fetch-event-source's auto-retry; we surface it once.
          throw err;
        },
      });
    } catch (e) {
      if (!controller.signal.aborted) {
        opts.onError(e instanceof Error ? e.message : String(e));
      }
    }
  })();

  return { abort: () => controller.abort() };
}

/**
 * Heuristic verdict from the deltas: if the result frame arrived far later than
 * the progress frames before it (deltas tracking the tick), it streamed; if
 * every frame landed in one burst at the end, it buffered.
 */
export function verdictFor(rows: SseRow[], tickMs = 1000): SseVerdict {
  const progress = rows.filter((r) => r.event === 'progress');
  if (rows.length < 2 || progress.length < 1) return 'inconclusive';
  const spaced = progress.filter((r) => r.deltaFromPrevMs > tickMs * 0.5).length;
  if (spaced >= 1) return 'incremental';
  // All frames within a tiny window at the end is the buffered signature.
  const span = rows[rows.length - 1]!.clientRecvMs - rows[0]!.clientRecvMs;
  return span < tickMs * 0.5 ? 'buffered' : 'inconclusive';
}
