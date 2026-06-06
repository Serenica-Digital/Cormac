import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';
import { callRuntime, type RuntimeRequest } from './runtime.js';

/**
 * Proves the adapter's containment guarantee (ADR-006): well-formed runtime
 * output passes; malformed output and error responses are rejected and never
 * returned as a usable proposal. A tiny fake runtime stands in over real HTTP.
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

function reqWith(text: string): RuntimeRequest {
  return { workspaceId: 'w1', contract: EXAMPLE_PERSON_CONTRACT, text, records: [] };
}

describe('callRuntime', () => {
  it('returns a shape-valid proposal', async () => {
    const proposal = await callRuntime(baseUrl, reqWith('ok'));
    expect(proposal.changes).toHaveLength(1);
    expect(proposal.changes[0]!.op).toBe('update');
  });

  it('rejects malformed runtime output', async () => {
    await expect(callRuntime(baseUrl, reqWith('bad-shape'))).rejects.toMatchObject({
      code: 'runtime_invalid_output',
    });
  });

  it('rejects a runtime error response', async () => {
    await expect(callRuntime(baseUrl, reqWith('server-error'))).rejects.toBeInstanceOf(ProblemError);
  });

  it('rejects when the runtime is unreachable', async () => {
    // Port 1 is not listening.
    await expect(callRuntime('http://127.0.0.1:1', reqWith('ok'))).rejects.toMatchObject({
      code: 'runtime_unreachable',
    });
  });
});
