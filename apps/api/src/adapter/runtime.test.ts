import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';
import {
  buildTaskBrief,
  callStubRuntime,
  runHermesTask,
  type StubRuntimeRequest,
} from './runtime.js';

/**
 * Proves the adapter's containment guarantee (ADR-006) for both runtime
 * implementations, each against a tiny fake server over real HTTP.
 *
 * Stub path: well-formed output passes; malformed output and error responses
 * are rejected and never returned as a usable proposal.
 *
 * Hermes path: the Runs API conversation (bearer auth carried, taskId in the
 * brief and session, poll to terminal) plus every failure lane: failed run,
 * concurrency cap, timeout, unreachable. No proposal parsing happens here at
 * all; that is the point (the proposal arrives through the MCP write gate).
 */

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsed = JSON.parse(body) as { text?: string };
      const text = parsed.text ?? '';
      if (text.includes('server-error')) {
        res.writeHead(500).end('boom');
        return;
      }
      if (text.includes('bad-shape')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ not: 'a proposal' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          changes: [{ objectApiName: 'person', op: 'update', recordId: 'r1', values: { status: 'active' } }],
          uncertain: false,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server.close();
});

function reqWith(text: string): StubRuntimeRequest {
  return { workspaceId: 'w1', contract: EXAMPLE_PERSON_CONTRACT, text, records: [] };
}

describe('callStubRuntime', () => {
  it('returns a shape-valid proposal', async () => {
    const proposal = await callStubRuntime(baseUrl, reqWith('ok'));
    expect(proposal.changes).toHaveLength(1);
    expect(proposal.changes[0]!.op).toBe('update');
  });

  it('rejects malformed runtime output', async () => {
    await expect(callStubRuntime(baseUrl, reqWith('bad-shape'))).rejects.toMatchObject({
      code: 'runtime_invalid_output',
    });
  });

  it('rejects a runtime error response', async () => {
    await expect(callStubRuntime(baseUrl, reqWith('server-error'))).rejects.toBeInstanceOf(
      ProblemError,
    );
  });

  it('rejects when the runtime is unreachable', async () => {
    // Port 1 is not listening.
    await expect(callStubRuntime('http://127.0.0.1:1', reqWith('ok'))).rejects.toMatchObject({
      code: 'runtime_unreachable',
    });
  });
});

/**
 * Fake Hermes Runs API. The submitted brief's text selects the scenario; runs
 * are tracked so the first poll can return `running` before the terminal state,
 * proving the adapter actually polls.
 */
let hermes: http.Server;
let hermesUrl: string;
let lastAuthHeader: string | undefined;
let lastSubmitBody: { input?: string; session_id?: string } = {};
const runs = new Map<string, { scenario: string; polls: number }>();
let runCounter = 0;
const deletedSessions: string[] = [];
const stoppedRuns: string[] = [];

beforeAll(async () => {
  hermes = http.createServer((req, res) => {
    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method === 'POST' && req.url === '/v1/runs') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        lastAuthHeader = req.headers.authorization;
        lastSubmitBody = JSON.parse(body) as { input?: string; session_id?: string };
        const input = lastSubmitBody.input ?? '';
        if (input.includes('scenario-busy')) {
          json(429, { error: 'too many concurrent runs' });
          return;
        }
        const scenario = input.includes('scenario-fail')
          ? 'fail'
          : input.includes('scenario-poll-error')
            ? 'poll-error'
          : input.includes('scenario-slow')
            ? 'slow'
            : 'ok';
        const runId = `run-${++runCounter}`;
        runs.set(runId, { scenario, polls: 0 });
        json(202, { run_id: runId, status: 'queued' });
      });
      return;
    }

    const sessionDelete = req.url?.match(/^\/api\/sessions\/(.+)$/);
    if (req.method === 'DELETE' && sessionDelete) {
      deletedSessions.push(sessionDelete[1]!);
      json(200, { deleted: true });
      return;
    }

    const stop = req.url?.match(/^\/v1\/runs\/(.+)\/stop$/);
    if (req.method === 'POST' && stop) {
      stoppedRuns.push(stop[1]!);
      json(200, { status: 'stopping' });
      return;
    }

    const match = req.url?.match(/^\/v1\/runs\/([^/]+)$/);
    if (req.method === 'GET' && match) {
      const run = runs.get(match[1]!);
      if (!run) {
        json(404, { error: 'no such run' });
        return;
      }
      run.polls += 1;
      if (run.scenario === 'slow' || run.polls < 2) {
        json(200, { status: 'running' });
        return;
      }
      if (run.scenario === 'poll-error') {
        json(502, { error: 'poll exploded' });
        return;
      }
      if (run.scenario === 'fail') {
        json(200, { status: 'failed', output: 'tool exploded' });
        return;
      }
      json(200, { status: 'completed', output: 'all done', usage: { input_tokens: 5, output_tokens: 2 } });
      return;
    }

    json(404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => hermes.listen(0, '127.0.0.1', resolve));
  const addr = hermes.address();
  if (!addr || typeof addr === 'string') throw new Error('no hermes address');
  hermesUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  hermes.close();
});

const cfg = (overrides?: Partial<Parameters<typeof runHermesTask>[0]>) => ({
  url: hermesUrl,
  apiKey: 'test-key',
  timeoutMs: 2000,
  pollIntervalMs: 10,
  ...overrides,
});

describe('runHermesTask', () => {
  it('submits with bearer auth and the task brief, polls to completed, returns the output', async () => {
    const taskId = '6a2f7c1e-0000-4000-8000-000000000042';
    const outcome = await runHermesTask(cfg(), { taskId, text: 'update John to active' });

    expect(outcome.output).toBe('all done');
    expect(outcome.usage).toEqual({ input_tokens: 5, output_tokens: 2 });
    expect(lastAuthHeader).toBe('Bearer test-key');
    expect(lastSubmitBody.session_id).toBe(taskId);
    // The brief carries the taskId the agent must hand to submit_proposal.
    expect(lastSubmitBody.input).toContain(taskId);
    expect(lastSubmitBody.input).toContain('update John to active');
    // Stateless per task: the session is deleted once the run completes.
    expect(deletedSessions).toContain(taskId);
  });

  it('maps a failed run to runtime_failed with the run output as detail', async () => {
    await expect(runHermesTask(cfg(), { taskId: 't-fail', text: 'scenario-fail' })).rejects.toMatchObject({
      code: 'runtime_failed',
      detail: 'tool exploded',
    });
    expect(deletedSessions).toContain('t-fail');
  });

  it('maps the concurrency cap (429) to runtime_busy', async () => {
    await expect(runHermesTask(cfg(), { taskId: 't-busy', text: 'scenario-busy' })).rejects.toMatchObject({
      code: 'runtime_busy',
      status: 503,
    });
  });

  it('times out a run that never reaches a terminal state, stopping it and ending the session', async () => {
    await expect(
      runHermesTask(cfg({ timeoutMs: 100 }), { taskId: 't-slow', text: 'scenario-slow' }),
    ).rejects.toMatchObject({ code: 'runtime_timeout', status: 504 });
    expect(stoppedRuns.length).toBeGreaterThan(0);
    expect(deletedSessions).toContain('t-slow');
  });

  it('stops and ends the session when polling an accepted run errors', async () => {
    const stoppedBefore = stoppedRuns.length;
    await expect(
      runHermesTask(cfg(), { taskId: 't-poll-error', text: 'scenario-poll-error' }),
    ).rejects.toMatchObject({ code: 'runtime_error', status: 502 });
    expect(stoppedRuns.length).toBeGreaterThan(stoppedBefore);
    expect(deletedSessions).toContain('t-poll-error');
  });

  it('rejects when the runtime is unreachable', async () => {
    await expect(
      runHermesTask(cfg({ url: 'http://127.0.0.1:1' }), { taskId: 't', text: 'x' }),
    ).rejects.toMatchObject({ code: 'runtime_unreachable' });
  });
});

describe('buildTaskBrief', () => {
  it('instructs tool use and the exact submit_proposal taskId', () => {
    const brief = buildTaskBrief({ taskId: 'abc-123', text: 'hello' });
    expect(brief).toContain('submit_proposal with taskId "abc-123"');
    expect(brief).toContain('search_records');
    expect(brief).toContain('get_active_contract');
  });
});
