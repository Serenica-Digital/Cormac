import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@serenica/contract';
import { createServiceClient, type Db } from '@serenica/db';
import { buildAppContext, type AppContext } from '../apps/api/src/app.js';
import { loadConfig } from '../apps/api/src/config.js';
import { captureUpdate } from '../apps/api/src/pipeline/capture.js';
import type { RequestContext } from '../apps/api/src/types.js';
import { TestResources } from './helpers.js';

/**
 * Usage telemetry survives the run (#39): capture persists the run id and the
 * usage object onto the source message, whatever the proposal outcome. A mock
 * Runs API stands in for Hermes (completed run, no proposal submitted, usage in
 * the terminal payload), so the test proves the persistence seam, not the
 * model. Skips without local Supabase.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && serviceKey);

const USAGE = { input_tokens: 1234, output_tokens: 56, total_cost_usd: 0.0123 };

describe.skipIf(!ready)('usage telemetry persistence', () => {
  let runtime: http.Server;
  let service: Db;
  let app: AppContext;
  let ctx: RequestContext;
  const resources = new TestResources();

  beforeAll(async () => {
    // Minimal Runs API: accept, complete-with-usage on first poll, end session.
    runtime = http.createServer((req, res) => {
      const ok = (body: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'POST' && req.url === '/v1/runs') {
        req.resume();
        req.on('end', () => ok({ run_id: 'run-telemetry-1' }));
        return;
      }
      if (req.method === 'GET' && req.url?.startsWith('/v1/runs/')) {
        ok({ status: 'completed', output: 'Nothing to change.', usage: USAGE });
        return;
      }
      // Session delete and anything else: acknowledge.
      ok({});
    });
    await new Promise<void>((resolve) => runtime.listen(0, '127.0.0.1', resolve));
    const addr = runtime.address();
    if (!addr || typeof addr === 'string') throw new Error('no runtime address');

    service = createServiceClient(url!, serviceKey!);
    app = buildAppContext(
      loadConfig({
        ...process.env,
        RUNTIME_KIND: 'hermes',
        RUNTIME_URL: `http://127.0.0.1:${addr.port}`,
      }),
    );

    const ws = await service.from('workspaces').insert({ name: `usage-${randomUUID()}` }).select('id').single();
    const workspaceId = resources.workspace(ws.data!.id as string);
    const user = await service.auth.admin.createUser({
      email: `usage-${randomUUID()}@test.local`,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    const userId = resources.user(user.data.user!.id);
    await service.from('memberships').insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });
    await service.from('contract_versions').insert({
      workspace_id: workspaceId,
      version: 1,
      document: EXAMPLE_PERSON_CONTRACT,
      is_active: true,
    });
    ctx = { userId, workspaceId, role: 'owner' };
  });

  afterAll(async () => {
    runtime.close();
    await resources.cleanup(service);
  });

  it('persists run id and usage on the source message, even on a decline', async () => {
    const result = await captureUpdate(app, ctx, 'Nothing actionable here.');
    expect(result.status).toBe('no_proposal');

    const row = await service
      .from('source_messages')
      .select('runtime_run_id, runtime_usage')
      .eq('id', result.sourceMessageId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data!.runtime_run_id).toBe('run-telemetry-1');
    expect(row.data!.runtime_usage).toEqual(USAGE);
  });
});
