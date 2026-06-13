import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProblemError } from '@cormac/shared';
import { authenticate, requireCapability, requireCtx } from '../auth.js';
import { captureUpdate, type CaptureResult } from '../pipeline/capture.js';

/**
 * Probe A of the M1 pane spike (ADR-028): does an SSE stream survive the Office
 * webview incrementally, or does the webview buffer it to the end? This is a
 * sibling of POST /capture with the IDENTICAL authz chain, so the probe proves
 * the transport without changing the runtime adapter (the spike's central
 * constraint). It reuses `captureUpdate` unmodified and streams wall-clock
 * progress around it; Hermes returns only a terminal result, so there is no
 * token stream to forward here. The route is inert unless SSE_PROBE_ENABLED.
 */

const querySchema = z.object({ text: z.string().min(1).max(4000) });

/** A minimal sink so the streaming logic is testable without a live socket. */
export interface SseSink {
  write(chunk: string): void;
  end(): void;
}

export interface EmitLog {
  seq: number;
  event: string;
  t: number;
}

/**
 * Write one SSE frame and return its log line. The `id:` carries the sequence so
 * a client can order arrivals (and spot reframing) even if the transport
 * coalesces chunks, which is exactly what the probe is watching for.
 */
export function writeSseEvent(
  sink: SseSink,
  seq: number,
  event: string,
  data: unknown,
  now: () => number = Date.now,
): EmitLog {
  const t = now();
  sink.write(`id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return { seq, event, t };
}

export interface StreamCaptureOptions {
  /** The already-started capture work; streamCapture does not start it. */
  work: Promise<CaptureResult>;
  tickMs: number;
  now?: () => number;
  onEmit?: (log: EmitLog) => void;
  /** Turn a thrown error into the client-facing `error` frame. Defaults to a
   * generic payload so streamCapture never leaks a raw message; the route passes
   * `safeErrorPayload` to mirror the central scrub (control #6). */
  formatError?: (err: unknown) => Record<string, unknown>;
}

/**
 * Mirror of the server's error handler (#6) for the hijacked SSE path, which
 * never reaches that handler: 4xx ProblemError detail is caller-authored and
 * passes through; 5xx detail is logged and withheld; anything else is logged and
 * returned as a generic message. Without this, a raw error's message would
 * stream straight to the client.
 */
export function safeErrorPayload(err: unknown, log: Pick<FastifyBaseLogger, 'error'>): Record<string, unknown> {
  if (err instanceof ProblemError) {
    if (err.status >= 500) {
      log.error({ code: err.code, detail: err.detail }, err.message);
      return { code: err.code, message: err.message };
    }
    return { code: err.code, message: err.message, detail: err.detail };
  }
  log.error(err);
  return { message: 'Internal error' };
}

/**
 * Emit `received` immediately, an immediate `progress` heartbeat (so the client
 * confirms the transport is live without waiting a full tick), then a `progress`
 * tick every tickMs while the work runs, then a terminal `result` (or `error`)
 * and `done`. Returns the ordered emit log so a test can assert the sequence
 * without a socket or a database. Ticks are wall-clock progress, not tokens.
 */
export async function streamCapture(
  sink: SseSink,
  { work, tickMs, now = Date.now, onEmit, formatError }: StreamCaptureOptions,
): Promise<EmitLog[]> {
  const log: EmitLog[] = [];
  let seq = 0;
  const emit = (event: string, data: unknown) => {
    const entry = writeSseEvent(sink, seq++, event, data, now);
    log.push(entry);
    onEmit?.(entry);
  };

  emit('received', { ok: true });
  emit('progress', { tick: 0 });
  let ticks = 0;
  const interval = setInterval(() => emit('progress', { tick: ++ticks }), tickMs);
  try {
    const result = await work;
    emit('result', result);
  } catch (err) {
    emit('error', formatError ? formatError(err) : { message: 'capture failed' });
  } finally {
    clearInterval(interval);
    emit('done', { ok: true });
    sink.end();
  }
  return log;
}

export function registerCaptureStreamRoute(app: FastifyInstance): void {
  if (!app.app.config.SSE_PROBE_ENABLED) {
    app.log.info('SSE streaming probe disabled (SSE_PROBE_ENABLED not set)');
    return;
  }

  app.get(
    '/api/workspaces/:workspaceId/capture/stream',
    // Same chain as POST /capture, so authz is provably identical (the 401/403
    // decision lands before any byte of the stream is written).
    { preHandler: [authenticate, requireCapability('capture_update')] },
    async (request, reply) => {
      const ctx = requireCtx(request);
      // Spike note: `text` is a query param, so capture content lands in the
      // request log. Acceptable here (probe is off by default, synthetic data),
      // but the M3 production stream should POST the text or redact the log.
      const { text } = querySchema.parse(request.query); // validate before hijack

      // After hijack, Fastify must not touch this response. no-transform +
      // X-Accel-Buffering defeat proxy buffering; setNoDelay removes TCP
      // coalescing so the probe measures the webview, not Nagle.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.socket?.setNoDelay(true);

      let ended = false;
      const sink: SseSink = {
        write: (chunk) => {
          if (!ended) reply.raw.write(chunk);
        },
        end: () => {
          if (!ended) {
            ended = true;
            reply.raw.end();
          }
        },
      };

      // Backstop only: captureUpdate enforces RUNTIME_TIMEOUT_MS itself, so this
      // fires solely if the work ignores its own deadline. unref so it never
      // keeps the process alive.
      const deadline = setTimeout(() => {
        writeSseEvent(sink, -1, 'error', { message: 'stream deadline' });
        sink.end();
      }, app.app.config.RUNTIME_TIMEOUT_MS + 5000);
      deadline.unref?.();
      reply.raw.on('close', () => clearTimeout(deadline));

      // Reuse the real pipeline unmodified; start it, then stream around it.
      const work = captureUpdate(app.app, ctx, text);
      try {
        await streamCapture(sink, {
          work,
          tickMs: app.app.config.SSE_TICK_MS,
          onEmit: (e) => request.log.info({ seq: e.seq, event: e.event, t: e.t }, 'sse'),
          formatError: (err) => safeErrorPayload(err, request.log),
        });
      } finally {
        clearTimeout(deadline);
      }
    },
  );
}
