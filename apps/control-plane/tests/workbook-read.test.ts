import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '../src/db.js';
import { hashAgentToken } from '../src/auth.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The read_workbook binding: the human upload endpoint feeds workbook_snapshots
 * and the agent read serves the LATEST profile per (workspace, name), byte-equal
 * to what was uploaded. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('workbook snapshots: upload + agent read', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerToken: string;
  let agentToken: string;
  const resources = new TestResources();

  const profileV1 = { workbookName: 'tracker.xlsx', sheets: [{ name: 'One', headerRow: 1 }] };
  const profileV2 = { workbookName: 'tracker.xlsx', sheets: [{ name: 'One' }, { name: 'Two' }] };
  /** Uploaded last, under a different name: the no-name read must serve this. */
  const clientProfile = { workbookName: 'client-workbook.xlsx', sheets: [{ name: 'Deals' }] };

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'wb' });
    ownerToken = await mintToken(seed.userId);
    agentToken = randomBytes(32).toString('hex');
    await service.from('agent_tokens').insert({
      workspace_id: seed.workspaceId,
      agent: 'authoring',
      token_hash: hashAgentToken(agentToken),
    });
    server = await buildServer(loadConfig());

    for (const profile of [profileV1, profileV2]) {
      const res = await server.inject({
        method: 'POST',
        url: `/api/workspaces/${seed.workspaceId}/workbook`,
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
        payload: { name: 'relationship-crm', profile },
      });
      expect(res.statusCode).toBe(200);
    }
    const client = await server.inject({
      method: 'POST',
      url: `/api/workspaces/${seed.workspaceId}/workbook`,
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      payload: { name: 'client-workbook', profile: clientProfile },
    });
    expect(client.statusCode).toBe(200);
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('serves the latest uploaded profile verbatim', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=relationship-crm',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(profileV2);
  });

  it('with no name, serves the workspace latest upload across names (the web-app path)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/agent/workbook',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(clientProfile);
  });

  it('404s an unknown workbook name', async () => {
    const unknown = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=nope',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(unknown.statusCode).toBe(404);
  });
});
