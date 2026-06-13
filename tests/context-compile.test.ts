import 'dotenv/config';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createServiceClient, type Db } from '@cormac/db';
import { buildAppContext, type AppContext } from '../apps/api/src/app.js';
import { loadConfig } from '../apps/api/src/config.js';
import { compileWorkspaceContext } from '../apps/api/src/pipeline/context.js';
import { captureUpdate } from '../apps/api/src/pipeline/capture.js';
import type { RequestContext } from '../apps/api/src/types.js';
import { requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The compiled context prefix (ADR-027 section 3, #48). compileWorkspaceContext
 * resolves active learned rows to render views (alias -> current record, null
 * when archived; enum synonym field-for-field), renders only active items, and
 * is byte-stable. Capture on the Hermes path passes the block as the run's
 * instructions. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('compiled workspace context', () => {
  let service: Db;
  let app: AppContext;
  let ctx: RequestContext;
  let workspaceId: string;
  let johnId: string;
  let hermes: http.Server;
  let receivedInstructions: string | undefined;
  const resources = new TestResources();

  beforeAll(async () => {
    // A fake Hermes Runs API that records the submitted instructions and reports
    // a completed run with no proposal.
    hermes = http.createServer((req, res) => {
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (req.method === 'POST' && req.url === '/v1/runs') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          receivedInstructions = (JSON.parse(body) as { instructions?: string }).instructions;
          json(202, { run_id: 'r1', status: 'queued' });
        });
        return;
      }
      if (req.method === 'GET' && req.url?.startsWith('/v1/runs/')) {
        json(200, { status: 'completed', output: 'no change' });
        return;
      }
      json(req.method === 'DELETE' ? 200 : 404, {});
    });
    await new Promise<void>((resolve) => hermes.listen(0, '127.0.0.1', resolve));
    const addr = hermes.address();
    if (!addr || typeof addr === 'string') throw new Error('no hermes address');
    process.env.RUNTIME_KIND = 'hermes';
    process.env.RUNTIME_URL = `http://127.0.0.1:${addr.port}`;

    service = createServiceClient(env.url, env.serviceKey);
    app = buildAppContext(loadConfig());

    const seed = await seedWorkspace(service, resources, { namePrefix: 'ctx' });
    workspaceId = seed.workspaceId;
    const userId = seed.userId;
    const john = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: seed.contractVersionId,
        data: { full_name: 'John Carter', email: 'john@carterdeals.test', status: 'lead' },
      })
      .select('id')
      .single();
    johnId = john.data!.id as string;
    const ghost = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: seed.contractVersionId,
        data: { full_name: 'Ghost Gone', status: 'lead' },
        archived_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Active alias + active synonym (render), a proposed alias and an archived-record
    // alias (must not render).
    await service.from('learned_knowledge').insert([
      {
        workspace_id: workspaceId,
        kind: 'alias',
        payload: { objectApiName: 'person', recordId: johnId, variant: 'Johnny' },
        record_id: johnId,
        status: 'active',
      },
      {
        workspace_id: workspaceId,
        kind: 'enum_synonym',
        payload: { objectApiName: 'person', fieldApiName: 'status', synonym: 'prospect', canonicalOption: 'lead' },
        status: 'active',
      },
      {
        workspace_id: workspaceId,
        kind: 'alias',
        payload: { objectApiName: 'person', recordId: johnId, variant: 'Hidden' },
        record_id: johnId,
        status: 'proposed',
      },
      {
        workspace_id: workspaceId,
        kind: 'alias',
        payload: { objectApiName: 'person', recordId: ghost.data!.id, variant: 'Ghost' },
        record_id: ghost.data!.id as string,
        status: 'active',
      },
    ]);

    ctx = { userId, workspaceId, role: 'owner' };
  });

  afterAll(async () => {
    hermes.close();
    await resources.cleanup(service);
  });

  it('renders the contract and only active learned items, resolving aliases to their record', async () => {
    const block = await compileWorkspaceContext(app, workspaceId, EXAMPLE_PERSON_CONTRACT);
    expect(block).toContain('== CONTRACT: Walking Skeleton Contract');
    expect(block).toContain('alias: "Johnny" -> John Carter (person)');
    expect(block).toContain('enum synonym: "prospect" -> lead (person.status)');
    // A proposed item and an archived-record alias never reach the prefix.
    expect(block).not.toContain('Hidden');
    expect(block).not.toContain('Ghost');
    // A sensitive value never reaches the prefix.
    expect(block).not.toContain('john@carterdeals.test');
  });

  it('is byte-stable across calls', async () => {
    const a = await compileWorkspaceContext(app, workspaceId, EXAMPLE_PERSON_CONTRACT);
    const b = await compileWorkspaceContext(app, workspaceId, EXAMPLE_PERSON_CONTRACT);
    expect(a).toBe(b);
  });

  it('capture on the Hermes path delivers the compiled block as the run instructions', async () => {
    receivedInstructions = undefined;
    const result = await captureUpdate(app, ctx, 'no-op message that matches nothing');
    expect(result.status).toBe('no_proposal');
    expect(receivedInstructions).toBeTruthy();
    expect(receivedInstructions!).toContain('== CONTRACT: Walking Skeleton Contract');
    expect(receivedInstructions!).toContain('alias: "Johnny" -> John Carter (person)');
  });
});
