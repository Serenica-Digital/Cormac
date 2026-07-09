import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '../src/db.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * Member management behavior on top of the RBAC matrix: add-by-email with
 * resolve-or-create, the owner-only rules around the owner role, the
 * last-owner invariant, role changes taking effect in requireCapability, the
 * audit trail for every mutation, and /api/me. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('membership management', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let workspaceId: string;
  let ownerId: string;
  let ownerToken: string;
  const resources = new TestResources();

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'members' });
    workspaceId = seed.workspaceId;
    ownerId = seed.userId;
    ownerToken = await mintToken(ownerId);
    server = await buildServer(loadConfig());
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  const base = () => `/api/workspaces/${workspaceId}`;
  const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });
  // Bodyless requests must not carry a content-type, or the JSON parser
  // rejects the empty body before authz runs.
  const bearerOnly = (t: string) => ({ authorization: `Bearer ${t}` });

  async function addMember(role: string, byToken = ownerToken, email?: string) {
    const res = await server.inject({
      method: 'POST',
      url: `${base()}/members`,
      headers: bearer(byToken),
      payload: { email: email ?? `${randomUUID()}@members.test`, role },
    });
    if (res.statusCode === 201) {
      resources.user(res.json().member.userId as string);
    }
    return res;
  }

  it('adds a member by email, creating the auth user, and audits it', async () => {
    const email = `${randomUUID()}@members.test`;
    const res = await addMember('member', ownerToken, email);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.userCreated).toBe(true);
    expect(body.member.email).toBe(email);
    expect(body.member.role).toBe('member');

    // The created user is real in GoTrue and has no password to leak.
    const user = await service.auth.admin.getUserById(body.member.userId);
    expect(user.data.user?.email).toBe(email);

    const list = await server.inject({
      method: 'GET',
      url: `${base()}/members`,
      headers: bearer(ownerToken),
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json().members.find((m: { userId: string }) => m.userId === body.member.userId);
    expect(listed).toMatchObject({ email, role: 'member' });

    const audit = await service
      .from('audit_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('action', 'member_added');
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_type: 'user',
      actor_id: ownerId,
      after: { user_id: body.member.userId, email, role: 'member' },
    });
  });

  it('rejects adding someone who is already a member', async () => {
    const email = `${randomUUID()}@members.test`;
    expect((await addMember('member', ownerToken, email)).statusCode).toBe(201);
    const dup = await addMember('manager', ownerToken, email);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('already_member');
  });

  it('resolves an existing auth user by email instead of creating one', async () => {
    const email = `${randomUUID()}@members.test`;
    const created = await service.auth.admin.createUser({ email, email_confirm: true });
    // No resources.user() here: addMember registers the resolved id on 201.

    const res = await addMember('read_only', ownerToken, email);
    expect(res.statusCode).toBe(201);
    expect(res.json().userCreated).toBe(false);
    expect(res.json().member.userId).toBe(created.data.user!.id);
  });

  it('makes a role change take effect in requireCapability, and audits it', async () => {
    const added = await addMember('member');
    const memberId = added.json().member.userId as string;
    const memberToken = await mintToken(memberId);

    // A member cannot decide proposals...
    const denied = await server.inject({
      method: 'POST',
      url: `${base()}/proposals/${randomUUID()}/decision`,
      headers: bearer(memberToken),
      payload: { decision: 'approve' },
    });
    expect(denied.statusCode).toBe(403);

    const patch = await server.inject({
      method: 'PATCH',
      url: `${base()}/members/${memberId}`,
      headers: bearer(ownerToken),
      payload: { role: 'manager' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().member.role).toBe('manager');

    // ...a manager passes authz (the random proposal then 404s).
    const admitted = await server.inject({
      method: 'POST',
      url: `${base()}/proposals/${randomUUID()}/decision`,
      headers: bearer(memberToken),
      payload: { decision: 'approve' },
    });
    expect(admitted.statusCode).toBe(404);

    const audit = await service
      .from('audit_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('action', 'member_role_changed');
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_id: ownerId,
      before: { user_id: memberId, role: 'member' },
      after: { user_id: memberId, role: 'manager' },
    });
  });

  it('reserves granting and removing the owner role to owners', async () => {
    const admin = await addMember('agent_admin');
    const adminToken = await mintToken(admin.json().member.userId as string);
    const target = await addMember('member');
    const targetId = target.json().member.userId as string;

    // An agent_admin manages members, but the owner role is not theirs to move.
    expect((await addMember('owner', adminToken)).statusCode).toBe(403);

    const grant = await server.inject({
      method: 'PATCH',
      url: `${base()}/members/${targetId}`,
      headers: bearer(adminToken),
      payload: { role: 'owner' },
    });
    expect(grant.statusCode).toBe(403);

    const demote = await server.inject({
      method: 'PATCH',
      url: `${base()}/members/${ownerId}`,
      headers: bearer(adminToken),
      payload: { role: 'member' },
    });
    expect(demote.statusCode).toBe(403);

    const remove = await server.inject({
      method: 'DELETE',
      url: `${base()}/members/${ownerId}`,
      headers: bearerOnly(adminToken),
    });
    expect(remove.statusCode).toBe(403);
  });

  it('refuses a self role change', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `${base()}/members/${ownerId}`,
      headers: bearer(ownerToken),
      payload: { role: 'member' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('never lets a workspace drop to zero owners', async () => {
    // A dedicated workspace so owner arithmetic stays isolated.
    const seed = await seedWorkspace(service, resources, { namePrefix: 'last-owner' });
    const soloToken = await mintToken(seed.userId);
    const wsBase = `/api/workspaces/${seed.workspaceId}`;

    const selfRemove = await server.inject({
      method: 'DELETE',
      url: `${wsBase}/members/${seed.userId}`,
      headers: bearerOnly(soloToken),
    });
    expect(selfRemove.statusCode).toBe(409);
    expect(selfRemove.json().error).toBe('last_owner');

    // With a second owner aboard, the first may leave...
    const second = await server.inject({
      method: 'POST',
      url: `${wsBase}/members`,
      headers: bearer(soloToken),
      payload: { email: `${randomUUID()}@members.test`, role: 'owner' },
    });
    expect(second.statusCode).toBe(201);
    const secondId = resources.user(second.json().member.userId as string);
    const secondToken = await mintToken(secondId);

    const leave = await server.inject({
      method: 'DELETE',
      url: `${wsBase}/members/${seed.userId}`,
      headers: bearerOnly(soloToken),
    });
    expect(leave.statusCode).toBe(200);

    // ...and the remaining owner is again the last one standing.
    const strand = await server.inject({
      method: 'DELETE',
      url: `${wsBase}/members/${secondId}`,
      headers: bearerOnly(secondToken),
    });
    expect(strand.statusCode).toBe(409);

    const audit = await service
      .from('audit_events')
      .select('*')
      .eq('workspace_id', seed.workspaceId)
      .eq('action', 'member_removed');
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_id: seed.userId,
      before: { user_id: seed.userId, role: 'owner' },
    });
  });

  it('answers /api/me with identity and the platform-operator flag', async () => {
    const before = await server.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(ownerToken),
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().userId).toBe(ownerId);
    expect(before.json().email).toContain('@');
    expect(before.json().platformAdmin).toBe(false);

    const insert = await service
      .from('platform_admins')
      .insert({ user_id: ownerId, note: 'membership test' });
    expect(insert.error).toBeNull();

    const after = await server.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(ownerToken),
    });
    expect(after.json().platformAdmin).toBe(true);
  });
});
