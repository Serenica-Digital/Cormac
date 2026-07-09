import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '../src/db.js';
import { hashAgentToken } from '../src/auth.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The platform-operator surface: only platform_admins reach it, holding the
 * flag does not bypass workspace guards, stats and detail views have their
 * shape, no response ever carries anything hash-like, and revocation through
 * the endpoint actually kills agent auth. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('operator surface', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let workspaceId: string;
  let ownerToken: string;
  let operatorId: string;
  let operatorToken: string;
  const resources = new TestResources();

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'operator' });
    workspaceId = seed.workspaceId;
    ownerToken = await mintToken(seed.userId);

    const operator = await service.auth.admin.createUser({
      email: `operator-${randomUUID()}@members.test`,
      email_confirm: true,
    });
    operatorId = resources.user(operator.data.user!.id);
    const flag = await service
      .from('platform_admins')
      .insert({ user_id: operatorId, note: 'operator test' });
    if (flag.error) throw new Error(`platform_admins insert: ${flag.error.message}`);
    operatorToken = await mintToken(operatorId);

    server = await buildServer(loadConfig());
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });
  const bearerOnly = (t: string) => ({ authorization: `Bearer ${t}` });

  it('rejects every operator route for non-operators: 401 unauth, 403 authenticated', async () => {
    const routes = [
      { method: 'GET', url: '/api/operator/workspaces' },
      { method: 'GET', url: `/api/operator/workspaces/${workspaceId}` },
      { method: 'POST', url: '/api/operator/workspaces', payload: { name: 'nope' } },
      { method: 'POST', url: `/api/operator/agent-tokens/${randomUUID()}/revoke` },
    ] as const;
    for (const r of routes) {
      const unauth = await server.inject({ method: r.method, url: r.url });
      expect(unauth.statusCode, `unauth ${r.method} ${r.url}`).toBe(401);

      // The workspace owner is a real, privileged user - just not an operator.
      const forbidden = await server.inject({
        method: r.method,
        url: r.url,
        headers: 'payload' in r ? bearer(ownerToken) : bearerOnly(ownerToken),
        ...('payload' in r ? { payload: r.payload } : {}),
      });
      expect(forbidden.statusCode, `owner ${r.method} ${r.url}`).toBe(403);
    }
  });

  it('does not let the operator flag bypass workspace capability guards', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/proposals`,
      headers: bearerOnly(operatorToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('lists workspaces with their stats', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/operator/workspaces',
      headers: bearerOnly(operatorToken),
    });
    expect(res.statusCode).toBe(200);
    const mine = res
      .json()
      .workspaces.find((w: { id: string }) => w.id === workspaceId);
    expect(mine).toBeDefined();
    expect(mine.stats).toMatchObject({
      memberCount: 1,
      contractVersion: 1,
      recordCount: 0,
      pendingProposalCount: 0,
    });
    expect(mine.stats).toHaveProperty('lastAuditAt');
  });

  it('serves the workspace detail: members, tokens, contract - and 404s unknown ids', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/operator/workspaces/${workspaceId}`,
      headers: bearerOnly(operatorToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspace.id).toBe(workspaceId);
    expect(body.members).toHaveLength(1);
    expect(body.members[0].role).toBe('owner');
    expect(body.members[0].email).toContain('@');
    expect(body.contract.version).toBe(1);
    expect(Array.isArray(body.agentTokens)).toBe(true);

    const unknown = await server.inject({
      method: 'GET',
      url: `/api/operator/workspaces/${randomUUID()}`,
      headers: bearerOnly(operatorToken),
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('creates a workspace, with and without a first owner', async () => {
    const bare = await server.inject({
      method: 'POST',
      url: '/api/operator/workspaces',
      headers: bearer(operatorToken),
      payload: { name: `op-created-${randomUUID()}` },
    });
    expect(bare.statusCode).toBe(201);
    resources.workspace(bare.json().workspace.id as string);
    expect(bare.json().owner).toBeNull();

    const email = `${randomUUID()}@members.test`;
    const owned = await server.inject({
      method: 'POST',
      url: '/api/operator/workspaces',
      headers: bearer(operatorToken),
      payload: { name: `op-owned-${randomUUID()}`, ownerEmail: email },
    });
    expect(owned.statusCode).toBe(201);
    const created = owned.json();
    resources.workspace(created.workspace.id as string);
    resources.user(created.owner.userId as string);
    expect(created.owner.userCreated).toBe(true);

    const membership = await service
      .from('memberships')
      .select('role')
      .eq('workspace_id', created.workspace.id)
      .eq('user_id', created.owner.userId)
      .single();
    expect(membership.data?.role).toBe('owner');

    const audit = await service
      .from('audit_events')
      .select('action')
      .eq('workspace_id', created.workspace.id);
    const actions = (audit.data ?? []).map((a) => a.action);
    expect(actions).toContain('workspace_created');
    expect(actions).toContain('member_added');
  });

  it('revokes an agent token idempotently, and the revocation kills agent auth', async () => {
    const raw = randomBytes(32).toString('hex');
    const inserted = await service
      .from('agent_tokens')
      .insert({ workspace_id: workspaceId, agent: 'operations', token_hash: hashAgentToken(raw) })
      .select('id')
      .single();
    const tokenId = inserted.data!.id as string;

    const before = await server.inject({
      method: 'GET',
      url: '/agent/contract',
      headers: bearerOnly(raw),
    });
    expect(before.statusCode).toBe(200);

    const revoke = await server.inject({
      method: 'POST',
      url: `/api/operator/agent-tokens/${tokenId}/revoke`,
      headers: bearerOnly(operatorToken),
    });
    expect(revoke.statusCode).toBe(200);
    const revokedAt = revoke.json().token.revokedAt;
    expect(revokedAt).toBeTruthy();

    const after = await server.inject({
      method: 'GET',
      url: '/agent/contract',
      headers: bearerOnly(raw),
    });
    expect(after.statusCode).toBe(401);

    // Idempotent: a second revoke answers the same shape and the same time.
    const again = await server.inject({
      method: 'POST',
      url: `/api/operator/agent-tokens/${tokenId}/revoke`,
      headers: bearerOnly(operatorToken),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().token.revokedAt).toBe(revokedAt);

    const audit = await service
      .from('audit_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('action', 'agent_token_revoked');
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_type: 'user',
      actor_id: operatorId,
      after: { token_id: tokenId, agent: 'operations' },
    });
  });

  it('never leaks anything hash-like in any operator response', async () => {
    for (const url of ['/api/operator/workspaces', `/api/operator/workspaces/${workspaceId}`]) {
      const res = await server.inject({ method: 'GET', url, headers: bearerOnly(operatorToken) });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toMatch(/[0-9a-f]{64}/);
    }
  });
});
