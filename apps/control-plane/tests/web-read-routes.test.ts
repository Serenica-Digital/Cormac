import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '../src/db.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The two web-surface read routes (#77): GET /api/workspaces (the sign-in
 * picker) and GET .../records/:recordId/timeline (audit events joined with the
 * utterance and proposal behind each change). Read-only; the writes here are
 * test seeding through the service role. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('web read routes', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  const resources = new TestResources();

  let workspaceId: string;
  let userId: string;
  let otherWorkspaceId: string;
  let otherUserId: string;
  let loneUserId: string;
  let recordId: string;
  let sourceMessageId: string;
  let proposalId: string;

  const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);

    const seed = await seedWorkspace(service, resources, { namePrefix: 'webread' });
    workspaceId = seed.workspaceId;
    userId = seed.userId;

    const other = await seedWorkspace(service, resources, { namePrefix: 'webread-other' });
    otherWorkspaceId = other.workspaceId;
    otherUserId = other.userId;

    // A user with no memberships at all: the picker must return empty, not 403.
    const lone = await service.auth.admin.createUser({
      email: `webread-lone-${randomUUID()}@test.local`,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    if (lone.error) throw new Error(`lone user: ${lone.error.message}`);
    loneUserId = resources.user(lone.data.user!.id);

    // Seed one applied capture end to end in rows: utterance -> proposal ->
    // record -> audit event linking all three (what decideProposal writes).
    const msg = await service
      .from('source_messages')
      .insert({ workspace_id: workspaceId, channel: 'web', user_id: userId, content: 'Just closed the deal with Carter' })
      .select('id')
      .single();
    if (msg.error) throw new Error(`source message: ${msg.error.message}`);
    sourceMessageId = msg.data!.id as string;

    const prop = await service
      .from('agent_proposals')
      .insert({
        workspace_id: workspaceId,
        source_message_id: sourceMessageId,
        payload: { changes: [], uncertain: false },
        status: 'applied',
        created_by: userId,
      })
      .select('id')
      .single();
    if (prop.error) throw new Error(`proposal: ${prop.error.message}`);
    proposalId = prop.data!.id as string;

    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: seed.contractVersionId,
        data: { name: 'Carter', status: 'closed' },
        created_by: userId,
      })
      .select('id')
      .single();
    if (rec.error) throw new Error(`record: ${rec.error.message}`);
    recordId = rec.data!.id as string;

    const audit = await service.from('audit_events').insert({
      workspace_id: workspaceId,
      actor_type: 'user',
      actor_id: userId,
      action: 'create',
      object_api_name: 'person',
      record_id: recordId,
      before: null,
      after: { name: 'Carter', status: 'closed' },
      source_message_id: sourceMessageId,
      proposal_id: proposalId,
    });
    if (audit.error) throw new Error(`audit event: ${audit.error.message}`);

    server = await buildServer(loadConfig());
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('GET /api/workspaces requires a token', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/workspaces' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/workspaces lists exactly the caller memberships with roles', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces',
      headers: bearer(await mintToken(userId)),
    });
    expect(res.statusCode).toBe(200);
    const { workspaces } = res.json() as { workspaces: Array<{ id: string; name: string; role: string }> };
    expect(workspaces.some((w) => w.id === workspaceId && w.role === 'owner')).toBe(true);
    expect(workspaces.some((w) => w.id === otherWorkspaceId)).toBe(false);
  });

  it('GET /api/workspaces returns an empty list for a user with no memberships', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces',
      headers: bearer(await mintToken(loneUserId)),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().workspaces).toEqual([]);
  });

  it('timeline joins the utterance and proposal status onto the record audit trail', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/records/${recordId}/timeline`,
      headers: bearer(await mintToken(userId)),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      record: { id: string; data: Record<string, unknown> };
      entries: Array<Record<string, unknown>>;
    };
    expect(body.record.id).toBe(recordId);
    expect(body.record.data).toMatchObject({ name: 'Carter' });
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      action: 'create',
      actorType: 'user',
      utterance: 'Just closed the deal with Carter',
      channel: 'web',
      proposalId,
      proposalStatus: 'applied',
    });
    expect(body.entries[0]?.after).toMatchObject({ name: 'Carter' });
  });

  it('timeline is workspace-scoped: a non-member is refused, a foreign record is not found', async () => {
    const nonMember = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/records/${recordId}/timeline`,
      headers: bearer(await mintToken(otherUserId)),
    });
    expect(nonMember.statusCode).toBe(403);

    // A member of the other workspace asking for OUR record through THEIR
    // workspace path: the record does not exist there.
    const foreign = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${otherWorkspaceId}/records/${recordId}/timeline`,
      headers: bearer(await mintToken(otherUserId)),
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('timeline 404s on an unknown record', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/records/${randomUUID()}/timeline`,
      headers: bearer(await mintToken(userId)),
    });
    expect(res.statusCode).toBe(404);
  });
});
