import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createAnonClient, createServiceClient, createUserClient, type Db } from '../src/db.js';
import { requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The publish_contract RPC gate at the database level (derived from v0's
 * contract-publish suite; the route-level 422 checks arrive with the app in
 * phase 4). Proves: server-authoritative version, exactly one active version,
 * the publish is audited with before/after, and an authenticated user cannot
 * call the RPC directly. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('publish_contract RPC gate', () => {
  let service: Db;
  let workspaceId: string;
  let ownerId: string;
  let ownerEmail: string;
  let ownerPassword: string;
  const resources = new TestResources();

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    // seedWorkspace creates a v1 active contract, so a publish here becomes v2.
    const seed = await seedWorkspace(service, resources, { namePrefix: 'pubrpc' });
    workspaceId = seed.workspaceId;
    ownerId = seed.userId;
    ownerEmail = seed.ownerEmail;
    ownerPassword = seed.ownerPassword;
  });

  afterAll(async () => {
    await resources.cleanup(service);
  });

  it('bumps the version server-side, keeps exactly one active, and audits before/after', async () => {
    // The caller's document claims version 99; the RPC must ignore it.
    const doc = { ...EXAMPLE_PERSON_CONTRACT, version: 99 };
    const { data, error } = await service.rpc('publish_contract', {
      p_workspace_id: workspaceId,
      p_document: doc,
      p_actor_id: ownerId,
    });
    expect(error).toBeNull();
    expect((data as { version: number }).version).toBe(2);

    const versions = await service
      .from('contract_versions')
      .select('version, is_active, document')
      .eq('workspace_id', workspaceId);
    const active = (versions.data ?? []).filter((v) => v.is_active);
    expect(active).toHaveLength(1);
    expect(active[0]!.version).toBe(2);
    // The stored document carries the server-assigned version, not the caller's.
    expect((active[0]!.document as { version: number }).version).toBe(2);

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

  it('refuses publish_contract called directly by an authenticated user', async () => {
    const anon = createAnonClient(env.url, env.anonKey);
    const signin = await anon.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
    const asUser = createUserClient(env.url, env.anonKey, signin.data.session!.access_token);

    const { error } = await asUser.rpc('publish_contract', {
      p_workspace_id: workspaceId,
      p_document: EXAMPLE_PERSON_CONTRACT,
      p_actor_id: ownerId,
    });
    expect(error).not.toBeNull();
  });
});
