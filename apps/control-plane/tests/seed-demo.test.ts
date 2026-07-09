import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '../src/db.js';
import { runDemoSeed, type DemoSeedResult } from '../../../scripts/lib/demo-seed.js';
import { requireSupabaseEnv } from './helpers.js';

/**
 * The demo seed's contract is idempotency: a second run reuses everything and
 * duplicates nothing. Runs under a throwaway namespace so it never touches
 * the real demo workspaces, and never binds tokens (namespace-gated in the
 * lib, and asserted here). Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('demo seed idempotency', () => {
  let service: Db;
  const namespace = `dt${randomUUID().slice(0, 8)}`;
  let first: DemoSeedResult;
  let second: DemoSeedResult;

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    first = await runDemoSeed(service, { namespace, bindTokens: true });
    second = await runDemoSeed(service, { namespace, bindTokens: true });
  });

  afterAll(async () => {
    for (const ws of [first.workspaces.gettingStarted.id, first.workspaces.liveBook.id]) {
      const { error } = await service.rpc('purge_workspace', { p_workspace_id: ws });
      if (error) console.warn(`cleanup purge_workspace(${ws}): ${error.message}`);
    }
    for (const p of first.personas) {
      const { error } = await service.auth.admin.deleteUser(p.userId);
      if (error) console.warn(`cleanup deleteUser(${p.email}): ${error.message}`);
    }
  });

  it('reuses both workspaces by name', async () => {
    expect(second.workspaces.gettingStarted.id).toBe(first.workspaces.gettingStarted.id);
    expect(second.workspaces.liveBook.id).toBe(first.workspaces.liveBook.id);

    for (const name of [first.workspaces.gettingStarted.name, first.workspaces.liveBook.name]) {
      const { data } = await service.from('workspaces').select('id').eq('name', name);
      expect(data, name).toHaveLength(1);
    }
  });

  it('reuses every persona and their memberships', async () => {
    const firstIds = new Map(first.personas.map((p) => [p.email, p.userId]));
    for (const p of second.personas) {
      expect(p.userId, p.email).toBe(firstIds.get(p.email));
    }

    const { data } = await service
      .from('memberships')
      .select('user_id, role')
      .eq('workspace_id', first.workspaces.liveBook.id);
    // owner, admin, manager, member, viewer - once each, no duplicates.
    expect(data).toHaveLength(5);
  });

  it('does not re-publish the contract or re-seed the book', async () => {
    const versions = await service
      .from('contract_versions')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', first.workspaces.liveBook.id);
    expect(versions.count).toBe(1);

    const records = await service
      .from('business_records')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', first.workspaces.liveBook.id);
    expect(records.count).toBe(20);

    const snapshots = await service
      .from('workbook_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', first.workspaces.gettingStarted.id);
    expect(snapshots.count).toBe(1);
  });

  it('never binds tokens outside the demo namespace, even when asked', () => {
    expect(first.tokens).toBeNull();
    expect(second.tokens).toBeNull();
  });
});
