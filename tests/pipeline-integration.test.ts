import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@serenica/contract';
import { createServiceClient, type Db } from '@serenica/db';
import { propose } from '../services/runtime-stub/src/propose.js';
import { buildAppContext } from '../apps/api/src/app.js';
import { loadConfig } from '../apps/api/src/config.js';
import { captureUpdate } from '../apps/api/src/pipeline/capture.js';
import { decideProposal } from '../apps/api/src/pipeline/apply.js';
import type { AppContext } from '../apps/api/src/app.js';
import type { RequestContext } from '../apps/api/src/types.js';
import { TestResources } from './helpers.js';

/**
 * The spine, end to end against a real DB: capture -> validate -> confirm ->
 * write -> audit (control-register rows 7, 8), plus the human-only gate
 * rejecting at capture (row 4). Uses the real runtime-stub logic behind a local
 * HTTP server so the adapter is exercised too. Skips without local Supabase.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && serviceKey);

describe.skipIf(!ready)('pipeline integration: capture -> confirm -> write -> audit', () => {
  let server: http.Server;
  let service: Db;
  let app: AppContext;
  let ctx: RequestContext;
  let johnId: string;
  const resources = new TestResources();

  beforeAll(async () => {
    // A local fake runtime that runs the real stub logic.
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const out = propose(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    process.env.RUNTIME_URL = `http://127.0.0.1:${addr.port}`;
    // The stub path is the deterministic test fixture (ADR-021 open item 4).
    process.env.RUNTIME_KIND = 'stub';

    service = createServiceClient(url!, serviceKey!);
    app = buildAppContext(loadConfig());

    const ws = await service.from('workspaces').insert({ name: `pipe-${randomUUID()}` }).select('id').single();
    const workspaceId = resources.workspace(ws.data!.id as string);
    const user = await service.auth.admin.createUser({
      email: `pipe-${randomUUID()}@test.local`,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    const userId = resources.user(user.data.user!.id);
    await service.from('memberships').insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });

    const cv = await service
      .from('contract_versions')
      .insert({ workspace_id: workspaceId, version: 1, document: EXAMPLE_PERSON_CONTRACT, is_active: true })
      .select('id')
      .single();
    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: cv.data!.id,
        data: { full_name: 'John Carter', email: 'john@carterdeals.test', status: 'lead' },
      })
      .select('id')
      .single();
    johnId = rec.data!.id as string;

    ctx = { userId, workspaceId, role: 'owner' };
  });

  afterAll(async () => {
    server.close();
    await resources.cleanup(service);
  });

  it('captures, holds, approves, writes the record, and audits with before/after', async () => {
    const captured = await captureUpdate(
      app,
      ctx,
      "Talked to John about the waterfront deal, he's interested.",
    );
    expect(captured.status).toBe('pending');
    expect(captured.proposalId).toBeTruthy();

    const result = await decideProposal(app, ctx, captured.proposalId!, 'approve');
    expect(result.status).toBe('applied');

    const updated = await service.from('business_records').select('data').eq('id', johnId).single();
    const data = updated.data!.data as Record<string, unknown>;
    expect(data.status).toBe('active');
    expect(typeof data.last_interaction_note).toBe('string');
    // The human-only field was never touched.
    expect('internal_rating' in data).toBe(false);

    const audit = await service
      .from('audit_events')
      .select('*')
      .eq('record_id', johnId)
      .eq('action', 'record_updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(audit.data!.source_message_id).toBeTruthy();
    expect((audit.data!.before as Record<string, unknown>).status).toBe('lead');
    expect((audit.data!.after as Record<string, unknown>).status).toBe('active');
  });

  it('rejects a proposal that targets a human-only field, writing nothing', async () => {
    await expect(captureUpdate(app, ctx, 'Set rating to 9 for John.')).rejects.toMatchObject({
      code: 'proposal_invalid',
    });

    const after = await service.from('business_records').select('data').eq('id', johnId).single();
    const data = after.data!.data as Record<string, unknown>;
    expect('internal_rating' in data).toBe(false);
  });
});
