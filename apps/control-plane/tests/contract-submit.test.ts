import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createServiceClient, type Db } from '../src/db.js';
import { hashAgentToken } from '../src/auth.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The submit_contract binding's endpoint contract (ADR-0004: the swap is
 * bindings, not cognition — this response shape is the spike validator's
 * repair signal and must not change): 200 {valid, summary, version,
 * contractVersionId} on publish; 422 {valid:false, issues:[{path,message}]}
 * verbatim Zod issues on failure, nothing published. Skips without local
 * Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('POST /agent/contract/submit', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let workspaceId: string;
  let token: string;
  const resources = new TestResources();

  const bearer = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'submit' });
    workspaceId = seed.workspaceId;
    token = randomBytes(32).toString('hex');
    await service
      .from('agent_tokens')
      .insert({ workspace_id: workspaceId, agent: 'authoring', token_hash: hashAgentToken(token) });
    server = await buildServer(loadConfig());
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('publishes a valid contract and answers the spike shape', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/agent/contract/submit',
      headers: bearer(),
      payload: { contract: EXAMPLE_PERSON_CONTRACT },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    // seedWorkspace already published v1, so the gate assigns v2.
    expect(body.version).toBe(2);
    expect(body.contractVersionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.summary).toContain('object(s)');
    expect(body.summary).toContain(`v2`);

    const active = await service
      .from('contract_versions')
      .select('version')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .single();
    expect(active.data!.version).toBe(2);
  });

  it('refuses an invalid contract with verbatim issues and publishes nothing', async () => {
    const before = await service
      .from('contract_versions')
      .select('id')
      .eq('workspace_id', workspaceId);
    const countBefore = (before.data ?? []).length;

    const res = await server.inject({
      method: 'POST',
      url: '/agent/contract/submit',
      headers: bearer(),
      // objects empty + a bad enum field shape: multiple Zod issues.
      payload: { contract: { name: 'broken', version: 1, objects: [] } },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) {
      expect(typeof issue.path).toBe('string');
      expect(typeof issue.message).toBe('string');
    }

    const after = await service
      .from('contract_versions')
      .select('id')
      .eq('workspace_id', workspaceId);
    expect((after.data ?? []).length).toBe(countBefore);
  });
});
