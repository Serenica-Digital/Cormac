import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createAnonClient, createServiceClient, createUserClient, type Db } from '@cormac/db';
import { buildServer } from '../../apps/api/src/server.js';
import { buildAppContext, type AppContext } from '../../apps/api/src/app.js';
import { loadConfig } from '../../apps/api/src/config.js';
import { publishContract } from '../../apps/api/src/pipeline/contract.js';
import type { RequestContext } from '../../apps/api/src/types.js';
import { requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The contract publish gate (ADR-002, ADR-027 section 2). The version is
 * server-authoritative, exactly one version is active, the publish is audited,
 * an invalid document is refused at the route and writes nothing, and an
 * authenticated user cannot call the RPC directly. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('contract publish gate', () => {
  let service: Db;
  let app: AppContext;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ctx: RequestContext;
  let workspaceId: string;
  let ownerEmail: string;
  let ownerPassword: string;
  const resources = new TestResources();

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    app = buildAppContext(loadConfig());
    server = await buildServer(loadConfig());

    // seedWorkspace creates a v1 active contract, so a publish here becomes v2.
    const seed = await seedWorkspace(service, resources, { namePrefix: 'pub' });
    workspaceId = seed.workspaceId;
    ownerEmail = seed.ownerEmail;
    ownerPassword = seed.ownerPassword;

    ctx = { userId: seed.userId, workspaceId, role: 'owner' };
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('bumps the version server-side, keeps exactly one active, and audits before/after', async () => {
    const result = await publishContract(app, ctx, EXAMPLE_PERSON_CONTRACT);
    expect(result.version).toBe(2);

    const versions = await service
      .from('contract_versions')
      .select('version, is_active')
      .eq('workspace_id', workspaceId);
    const active = (versions.data ?? []).filter((v) => v.is_active);
    expect(active).toHaveLength(1);
    expect(active[0]!.version).toBe(2);

    const audit = await service
      .from('audit_events')
      .select('before, after')
      .eq('workspace_id', workspaceId)
      .eq('action', 'contract_published')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect((audit.data!.before as Record<string, unknown>).version).toBe(1);
    expect((audit.data!.after as Record<string, unknown>).version).toBe(2);
  });

  it('refuses an invalid contract at the route and writes nothing', async () => {
    const anon = createAnonClient(env.url, env.anonKey);
    const signin = await anon.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
    const token = signin.data.session!.access_token;

    const before = await service
      .from('contract_versions')
      .select('id')
      .eq('workspace_id', workspaceId);
    const countBefore = (before.data ?? []).length;

    const res = await server.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/contract/publish`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { contract: { name: 'broken', version: 1, objects: [] } },
    });
    expect(res.statusCode).toBe(422);

    const after = await service
      .from('contract_versions')
      .select('id')
      .eq('workspace_id', workspaceId);
    expect((after.data ?? []).length).toBe(countBefore);
  });

  it('refuses publish_contract called directly by an authenticated user', async () => {
    const anon = createAnonClient(env.url, env.anonKey);
    const signin = await anon.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
    const asUser = createUserClient(env.url, env.anonKey, signin.data.session!.access_token);

    const { error } = await asUser.rpc('publish_contract', {
      p_workspace_id: workspaceId,
      p_document: EXAMPLE_PERSON_CONTRACT,
      p_actor_id: ctx.userId,
    });
    expect(error).not.toBeNull();
  });
});
