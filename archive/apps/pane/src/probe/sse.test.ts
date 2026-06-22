import { describe, expect, it, vi } from 'vitest';
import type { SseRow } from './sse';
import { verdictFor } from './sse';

// sse.ts imports the shared Supabase client, whose createClient throws without
// VITE_* env. Stub it so the pure verdict logic is importable in isolation.
vi.mock('../supabase', () => ({ supabase: {} }));

function row(event: string, deltaFromPrevMs: number, clientRecvMs: number): SseRow {
  return { seq: 0, event, deltaFromPrevMs, clientRecvMs };
}

describe('verdictFor (the GO/NO-GO decision logic)', () => {
  it('is incremental when progress deltas track the tick', () => {
    const rows = [
      row('received', 0, 0),
      row('progress', 0, 0),
      row('progress', 1000, 1000),
      row('progress', 1000, 2000),
      row('result', 80, 2080),
      row('done', 0, 2080),
    ];
    expect(verdictFor(rows, 1000)).toBe('incremental');
  });

  it('is buffered when every frame lands in one burst at the end', () => {
    const rows = [
      row('received', 5, 1500),
      row('progress', 1, 1501),
      row('result', 1, 1502),
      row('done', 0, 1502),
    ];
    expect(verdictFor(rows, 1000)).toBe('buffered');
  });

  it('is inconclusive with too few frames', () => {
    expect(verdictFor([row('received', 0, 0)], 1000)).toBe('inconclusive');
  });

  it('is inconclusive when there is no progress frame at all', () => {
    const rows = [row('received', 0, 0), row('result', 0, 5), row('done', 0, 5)];
    expect(verdictFor(rows, 1000)).toBe('inconclusive');
  });
});
