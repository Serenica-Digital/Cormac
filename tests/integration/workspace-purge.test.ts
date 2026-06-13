import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAnonClient, createServiceClient, createUserClient, type Db } from '@cormac/db';
import { requireSupabaseEnv } from './helpers.js';

/**
 * The deliberate workspace deletion path (issue #2, migration 0005). Proves:
 *   1. purge_workspace removes a workspace whose cascade includes audit rows,
 *      which a plain delete cannot do (the append-only trigger aborts it).
 *   2. The purge flag is transaction-local: directly deleting audit rows still
 *      raises afterwards, even for the service role.
 *   3. EXECUTE is service-role only: an authenticated user is refused.
 * Skipped without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('workspace purge path', () => {
  let service: Db;
  let userId: string;
  let userEmail: string;
  let userPassword: string;

  async function seedWorkspaceWithAudit(): Promise<string> {
    const ws = await service
      .from('workspaces')
      .insert({ name: `purge-${randomUUID()}` })
      .select('id')
      .single();
    if (ws.error) throw new Error(ws.error.message);
    const id = ws.data.id as string;
    const audit = await service
      .from('audit_events')
      .insert({ workspace_id: id, actor_type: 'agent', action: 'purge_probe' });
    if (audit.error) throw new Error(audit.error.message);
    const learned = await service.from('learned_knowledge').insert({
      workspace_id: id,
      kind: 'enum_synonym',
      payload: { objectApiName: 'person', fieldApiName: 'status', synonym: 'prospect', canonicalOption: 'lead' },
    });
    if (learned.error) throw new Error(learned.error.message);
    return id;
  }

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    userEmail = `purge-${randomUUID()}@test.local`;
    userPassword = `pw-${randomUUID()}`;
    const created = await service.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
    });
    userId = created.data.user!.id;
  });

  afterAll(async () => {
    await service.auth.admin.deleteUser(userId);
  });

  it('plain workspace delete still aborts on the audit cascade', async () => {
    const id = await seedWorkspaceWithAudit();
    const { error } = await service.from('workspaces').delete().eq('id', id);
    expect(error).not.toBeNull();
    // Clean up via the sanctioned path.
    await service.rpc('purge_workspace', { p_workspace_id: id });
  });

  it('purge_workspace removes the workspace and everything beneath it', async () => {
    const id = await seedWorkspaceWithAudit();
    const { error } = await service.rpc('purge_workspace', { p_workspace_id: id });
    expect(error).toBeNull();

    const ws = await service.from('workspaces').select('id').eq('id', id);
    expect(ws.data).toEqual([]);
    const audit = await service.from('audit_events').select('id').eq('workspace_id', id);
    expect(audit.data).toEqual([]);
    const learned = await service.from('learned_knowledge').select('id').eq('workspace_id', id);
    expect(learned.data).toEqual([]);
  });

  it('does not weaken append-only outside the purge: direct audit delete still raises', async () => {
    const id = await seedWorkspaceWithAudit();
    const { error } = await service.from('audit_events').delete().eq('workspace_id', id);
    expect(error).not.toBeNull();
    await service.rpc('purge_workspace', { p_workspace_id: id });
  });

  it('refuses an authenticated user', async () => {
    const id = await seedWorkspaceWithAudit();
    await service
      .from('memberships')
      .insert({ workspace_id: id, user_id: userId, role: 'owner' });

    const anon = createAnonClient(env.url, env.anonKey);
    const signin = await anon.auth.signInWithPassword({ email: userEmail, password: userPassword });
    const asUser = createUserClient(env.url, env.anonKey, signin.data.session!.access_token);

    const { error } = await asUser.rpc('purge_workspace', { p_workspace_id: id });
    expect(error).not.toBeNull();

    // The workspace survived the attempt.
    const ws = await service.from('workspaces').select('id').eq('id', id);
    expect(ws.data?.length).toBe(1);
    await service.rpc('purge_workspace', { p_workspace_id: id });
  });
});
