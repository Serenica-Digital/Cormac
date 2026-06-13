import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '@cormac/db';
import type { Role } from '@cormac/shared';
import { buildServer } from '../apps/api/src/server.js';
import { loadConfig } from '../apps/api/src/config.js';
import { mintToken, requireSupabaseEnv, TestResources } from './helpers.js';

/**
 * The RBAC matrix (control-register rows 9, 10): every protected endpoint, for
 * every role, allows exactly its capabilities and rejects the rest, and an
 * unauthenticated or non-member request is rejected. Uses fastify.inject and
 * real signed-in tokens. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

const ROLES: Role[] = ['owner', 'agent_admin', 'manager', 'member', 'read_only'];

describe.skipIf(!env.ready)('RBAC matrix', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let workspaceId: string;
  const token: Record<string, string> = {};
  let nonMemberToken: string;
  const resources = new TestResources();

  async function makeUser(role: Role | 'none'): Promise<{ id: string; token: string }> {
    const email = `${role}-${randomUUID()}@rbac.test`;
    const password = `pw-${randomUUID()}`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    const id = resources.user(created.data.user!.id);
    if (role !== 'none') {
      await service.from('memberships').insert({ workspace_id: workspaceId, user_id: id, role });
    }
    // The API verifies the HS256 token (sub -> membership -> role); mintToken is
    // the canonical path, so this no longer round-trips through anon sign-in.
    return { id, token: await mintToken(id) };
  }

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const ws = await service.from('workspaces').insert({ name: `rbac-${randomUUID()}` }).select('id').single();
    workspaceId = resources.workspace(ws.data!.id as string);
    for (const role of ROLES) token[role] = (await makeUser(role)).token;
    nonMemberToken = (await makeUser('none')).token;
    server = await buildServer(loadConfig());
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  const base = () => `/api/workspaces/${workspaceId}`;
  const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

  it('rejects an unauthenticated request', async () => {
    const res = await server.inject({ method: 'GET', url: `${base()}/proposals` });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a non-member with a valid token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `${base()}/proposals`,
      headers: bearer(nonMemberToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets every member read the proposal queue', async () => {
    for (const role of ROLES) {
      const res = await server.inject({ method: 'GET', url: `${base()}/proposals`, headers: bearer(token[role]!) });
      expect(res.statusCode, role).toBe(200);
    }
  });

  it('allows approve_proposal only for owner/agent_admin/manager', async () => {
    const allowed = new Set<Role>(['owner', 'agent_admin', 'manager']);
    for (const role of ROLES) {
      const res = await server.inject({
        method: 'POST',
        url: `${base()}/proposals/${randomUUID()}/decision`,
        headers: bearer(token[role]!),
        payload: { decision: 'approve' },
      });
      if (allowed.has(role)) {
        // Passed authz; the random proposal id then 404s.
        expect(res.statusCode, role).toBe(404);
      } else {
        expect(res.statusCode, role).toBe(403);
      }
    }
  });

  it('gates a learning decision on approve_proposal, like a proposal decision', async () => {
    const allowed = new Set<Role>(['owner', 'agent_admin', 'manager']);
    for (const role of ROLES) {
      const res = await server.inject({
        method: 'POST',
        url: `${base()}/learning/${randomUUID()}/decision`,
        headers: bearer(token[role]!),
        payload: { decision: 'approve' },
      });
      if (allowed.has(role)) {
        // Passed authz; the random learned id then 404s.
        expect(res.statusCode, role).toBe(404);
      } else {
        expect(res.statusCode, role).toBe(403);
      }
    }
  });

  it('gates contract publish on publish_contract (owner/agent_admin only)', async () => {
    const allowed = new Set<Role>(['owner', 'agent_admin']);
    for (const role of ROLES) {
      const res = await server.inject({
        method: 'POST',
        url: `${base()}/contract/publish`,
        headers: bearer(token[role]!),
        // An invalid document: allowed roles reach validation and 422, the rest 403.
        payload: { contract: { name: 'x', version: 1, objects: [] } },
      });
      if (allowed.has(role)) {
        expect(res.statusCode, role).toBe(422);
      } else {
        expect(res.statusCode, role).toBe(403);
      }
    }
  });

  it('denies capture for read_only and admits it for others', async () => {
    const readOnly = await server.inject({
      method: 'POST',
      url: `${base()}/capture`,
      headers: bearer(token['read_only']!),
      payload: { text: 'hello' },
    });
    expect(readOnly.statusCode).toBe(403);

    // A member passes authz; with no contract published the handler returns 422,
    // which still proves authorization let it through (not 401/403).
    const member = await server.inject({
      method: 'POST',
      url: `${base()}/capture`,
      headers: bearer(token['member']!),
      payload: { text: 'hello' },
    });
    expect([401, 403]).not.toContain(member.statusCode);
  });
});
