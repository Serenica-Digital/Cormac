import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '../src/db.js';
import { hashAgentToken } from '../src/auth.js';
import type { AgentKind } from '../src/shared.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The agent-token mechanism and the ops/authoring privilege split (ADR-0005):
 * tokens bind (workspace, agent kind); each kind reaches exactly its
 * endpoints; unknown and revoked tokens read identically as 401; only the
 * hash is at rest. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('agent tokens + privilege split', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const raw: Record<AgentKind, string> = { authoring: '', operations: '' };
  const resources = new TestResources();

  async function mint(ws: string, agent: AgentKind): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const { error } = await service
      .from('agent_tokens')
      .insert({ workspace_id: ws, agent, token_hash: hashAgentToken(token) });
    if (error) throw new Error(`mint: ${error.message}`);
    return token;
  }

  const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'agtok' });
    workspaceId = seed.workspaceId;
    const other = await seedWorkspace(service, resources, { namePrefix: 'agtok-other' });
    otherWorkspaceId = other.workspaceId;

    raw.authoring = await mint(workspaceId, 'authoring');
    raw.operations = await mint(workspaceId, 'operations');

    // A workbook snapshot in each workspace so reads are distinguishable.
    await service.from('workbook_snapshots').insert([
      { workspace_id: workspaceId, name: 'mine', profile: { owner: 'mine' } },
      { workspace_id: otherWorkspaceId, name: 'theirs', profile: { owner: 'theirs' } },
    ]);

    server = await buildServer(loadConfig());
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('rejects a missing or unknown token as 401', async () => {
    const missing = await server.inject({ method: 'GET', url: '/agent/workbook?name=mine' });
    expect(missing.statusCode).toBe(401);

    const unknown = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=mine',
      headers: bearer(randomBytes(32).toString('hex')),
    });
    expect(unknown.statusCode).toBe(401);
  });

  it('binds the token to its workspace: reads resolve there, with no workspaceId in the path', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=mine',
      headers: bearer(raw.authoring),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().owner).toBe('mine');

    // The other workspace's snapshot is unreachable by name: the token IS the binding.
    const cross = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=theirs',
      headers: bearer(raw.authoring),
    });
    expect(cross.statusCode).toBe(404);
  });

  it('enforces the privilege split: authoring cannot reach operations endpoints', async () => {
    for (const [method, url] of [
      ['GET', '/agent/contract'],
      ['GET', '/agent/records?query=x'],
      ['GET', `/agent/records/${randomUUID()}`],
      ['POST', '/agent/proposals'],
    ] as const) {
      const res = await server.inject({
        method,
        url,
        headers: bearer(raw.authoring),
        ...(method === 'POST' ? { payload: { taskId: randomUUID(), changes: [{}] } } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  it('enforces the privilege split: operations cannot reach authoring endpoints', async () => {
    const workbook = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=mine',
      headers: bearer(raw.operations),
    });
    expect(workbook.statusCode).toBe(403);

    const submit = await server.inject({
      method: 'POST',
      url: '/agent/contract/submit',
      headers: bearer(raw.operations),
      payload: { contract: {} },
    });
    expect(submit.statusCode).toBe(403);
  });

  it('a revoked token reads as 401, indistinguishable from unknown', async () => {
    const shortLived = await mint(workspaceId, 'authoring');
    const ok = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=mine',
      headers: bearer(shortLived),
    });
    expect(ok.statusCode).toBe(200);

    await service
      .from('agent_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', hashAgentToken(shortLived));

    const revoked = await server.inject({
      method: 'GET',
      url: '/agent/workbook?name=mine',
      headers: bearer(shortLived),
    });
    expect(revoked.statusCode).toBe(401);
  });

  it('stores only the hash at rest, never the raw token', async () => {
    const { data } = await service.from('agent_tokens').select('token_hash').eq('workspace_id', workspaceId);
    for (const row of data ?? []) {
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.token_hash).not.toBe(raw.authoring);
      expect(row.token_hash).not.toBe(raw.operations);
    }
  });
});
