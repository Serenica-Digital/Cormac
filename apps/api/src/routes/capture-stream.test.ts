import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProblemError } from '@cormac/shared';
import type { CaptureResult } from '../pipeline/capture.js';
import { loadConfig } from '../config.js';
import { buildServer } from '../server.js';
import { safeErrorPayload, streamCapture, type SseSink } from './capture-stream.js';

/**
 * Two claims, both without a database:
 *  1. The SSE envelope is received -> progress+ -> result -> done (or error ->
 *     done on failure), tested against streamCapture directly with a mock sink.
 *  2. Authz lands before the stream opens, and the route is inert unless the
 *     probe flag is set, tested via fastify.inject.
 */

function collectSink(): { sink: SseSink; chunks: string[]; ended: () => boolean } {
  const chunks: string[] = [];
  let isEnded = false;
  return {
    sink: {
      write: (c) => chunks.push(c),
      end: () => {
        isEnded = true;
      },
    },
    chunks,
    ended: () => isEnded,
  };
}

const SAMPLE: CaptureResult = {
  proposalId: 'p1',
  sourceMessageId: 's1',
  status: 'pending',
  uncertain: false,
  changeCount: 1,
};

describe('streamCapture envelope', () => {
  it('emits received -> progress -> result -> done in order and ends the sink', async () => {
    const { sink, chunks, ended } = collectSink();
    // A long tick means no interval fires before the resolved work; the only
    // progress is the immediate heartbeat, so the sequence is deterministic.
    const log = await streamCapture(sink, { work: Promise.resolve(SAMPLE), tickMs: 10_000 });
    const events = log.map((e) => e.event);

    expect(events[0]).toBe('received');
    expect(events).toContain('progress');
    expect(events[events.length - 2]).toBe('result');
    expect(events[events.length - 1]).toBe('done');
    expect(events).not.toContain('error');
    expect(ended()).toBe(true);

    const resultFrame = chunks.find((c) => c.includes('event: result'));
    expect(resultFrame).toContain('"proposalId":"p1"');
  });

  it('emits error then done (and no result) when the work rejects', async () => {
    const { sink, chunks, ended } = collectSink();
    const log = await streamCapture(sink, {
      work: Promise.reject(new Error('boom: secret upstream text')),
      tickMs: 10_000,
    });
    const events = log.map((e) => e.event);

    expect(events).toContain('error');
    expect(events).not.toContain('result');
    expect(events[events.length - 1]).toBe('done');
    expect(ended()).toBe(true);
    // The default formatter never leaks the raw error message.
    expect(chunks.join('')).not.toContain('secret upstream text');
  });

  it('streams extra progress ticks while the work is still running', async () => {
    const { sink } = collectSink();
    const slow = new Promise<CaptureResult>((resolve) => setTimeout(() => resolve(SAMPLE), 60));
    const log = await streamCapture(sink, { work: slow, tickMs: 15 });
    const progressCount = log.filter((e) => e.event === 'progress').length;
    // Immediate heartbeat plus at least one interval tick across ~60ms.
    expect(progressCount).toBeGreaterThanOrEqual(2);
  });
});

describe('safeErrorPayload (mirrors the #6 scrub on the hijacked path)', () => {
  it('withholds 5xx detail and logs it', () => {
    const log = { error: vi.fn() };
    const payload = safeErrorPayload(
      new ProblemError(502, 'runtime_error', 'Agent runtime returned 502', 'raw upstream text'),
      log,
    );
    expect(payload).toEqual({ code: 'runtime_error', message: 'Agent runtime returned 502' });
    expect(payload.detail).toBeUndefined();
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('passes 4xx detail through to the caller', () => {
    const log = { error: vi.fn() };
    const payload = safeErrorPayload(
      new ProblemError(422, 'proposal_invalid', 'Rejected', 'field x is human-only'),
      log,
    );
    expect(payload).toEqual({ code: 'proposal_invalid', message: 'Rejected', detail: 'field x is human-only' });
  });

  it('returns a generic payload for a raw error and logs it', () => {
    const log = { error: vi.fn() };
    const payload = safeErrorPayload(new Error('boom: secret'), log);
    expect(payload).toEqual({ message: 'Internal error' });
    expect(JSON.stringify(payload)).not.toContain('secret');
    expect(log.error).toHaveBeenCalledOnce();
  });
});

const WORKSPACE = '00000000-0000-4000-8000-000000000001';
const STREAM_URL = `/api/workspaces/${WORKSPACE}/capture/stream?text=hi`;

const BASE_ENV = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SUPABASE_JWT_SECRET: 'test-secret-with-at-least-32-characters!',
  RUNTIME_KIND: 'stub',
} as NodeJS.ProcessEnv;

describe('capture stream route gating and authz', () => {
  let onServer: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    onServer = await buildServer(loadConfig({ ...process.env, ...BASE_ENV, SSE_PROBE_ENABLED: 'true' }));
  });

  afterAll(async () => {
    await onServer.close();
  });

  it('rejects a missing token with 401 before opening the stream', async () => {
    const res = await onServer.inject({ method: 'GET', url: STREAM_URL });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type'] ?? '').not.toContain('text/event-stream');
  });

  it('is not registered when the probe flag is off (404)', async () => {
    const offServer = await buildServer(loadConfig({ ...process.env, ...BASE_ENV }));
    const res = await offServer.inject({ method: 'GET', url: STREAM_URL });
    expect(res.statusCode).toBe(404);
    await offServer.close();
  });
});
