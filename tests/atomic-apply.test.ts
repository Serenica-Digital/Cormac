import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAnonClient, createServiceClient, createUserClient, type Db } from '@cormac/db';
import { requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * Proves the atomic-apply fix against live Postgres (control-register claim #7).
 * This is invisible to the type-checker; the only proof is behavior:
 *   1. Happy path: the record write, the audit event, and the proposal status
 *      flip all land together.
 *   2. Forced mid-way failure: a two-change apply whose second change is doomed
 *      leaves ZERO of the three writes (the first change's record write and
 *      audit are rolled back, the proposal stays pending).
 *   3. Guardrail: an `authenticated` user cannot execute the function at all;
 *      EXECUTE is service-role only.
 *
 * Skipped without local Supabase.
 */
const env = requireSupabaseEnv();

interface ChangeInput {
  op: 'create' | 'update';
  objectApiName: string;
  recordId?: string;
  values: Record<string, unknown>;
}

describe.skipIf(!env.ready)('atomic apply_proposal', () => {
  let service: Db;
  let workspaceId: string;
  let ownerId: string;
  let contractVersionId: string;
  let ownerEmail: string;
  let ownerPassword: string;
  const resources = new TestResources();

  async function seedPerson(data: Record<string, unknown>): Promise<string> {
    const res = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: contractVersionId,
        data,
      })
      .select('id')
      .single();
    if (res.error) throw new Error(`seedPerson: ${res.error.message}`);
    return res.data.id as string;
  }

  // One proposal per source message is enforced by a unique index (migration
  // 0004), so each proposal gets its own source message, as in production.
  async function pendingProposal(
    changes: ChangeInput[],
  ): Promise<{ proposalId: string; sourceMessageId: string }> {
    const sm = await service
      .from('source_messages')
      .insert({ workspace_id: workspaceId, channel: 'web', user_id: ownerId, content: 'atomic test' })
      .select('id')
      .single();
    if (sm.error) throw new Error(`pendingProposal source message: ${sm.error.message}`);
    const sourceMessageId = sm.data.id as string;
    const res = await service
      .from('agent_proposals')
      .insert({
        workspace_id: workspaceId,
        source_message_id: sourceMessageId,
        status: 'pending',
        payload: { changes, uncertain: false },
        created_by: ownerId,
      })
      .select('id')
      .single();
    if (res.error) throw new Error(`pendingProposal: ${res.error.message}`);
    return { proposalId: res.data.id as string, sourceMessageId };
  }

  function callApply(client: Db, proposalId: string, changes: ChangeInput[]) {
    return client.rpc('apply_proposal', {
      p_workspace_id: workspaceId,
      p_proposal_id: proposalId,
      p_actor_id: ownerId,
      p_contract_version_id: contractVersionId,
      p_changes: changes,
    });
  }

  async function recordData(id: string): Promise<Record<string, unknown>> {
    const res = await service.from('business_records').select('data').eq('id', id).single();
    if (res.error) throw new Error(res.error.message);
    return res.data.data as Record<string, unknown>;
  }

  async function proposalStatus(id: string): Promise<string> {
    const res = await service.from('agent_proposals').select('status').eq('id', id).single();
    if (res.error) throw new Error(res.error.message);
    return res.data.status as string;
  }

  async function auditCount(proposalId: string): Promise<number> {
    const res = await service
      .from('audit_events')
      .select('*', { count: 'exact', head: true })
      .eq('proposal_id', proposalId);
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'atomic' });
    workspaceId = seed.workspaceId;
    ownerId = seed.userId;
    contractVersionId = seed.contractVersionId;
    ownerEmail = seed.ownerEmail;
    ownerPassword = seed.ownerPassword;
  });

  afterAll(async () => {
    await resources.cleanup(service);
  });

  it('lands all three writes together on the happy path', async () => {
    const rid = await seedPerson({ full_name: 'Atomic One', status: 'lead' });
    const { proposalId: pid, sourceMessageId } = await pendingProposal([
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
    ]);

    const { data, error } = await callApply(service, pid, [
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
    ]);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // 1. record write
    expect((await recordData(rid)).status).toBe('active');
    // 2. audit event with before/after and the source link
    const audit = await service
      .from('audit_events')
      .select('*')
      .eq('proposal_id', pid)
      .eq('action', 'record_updated')
      .single();
    expect(audit.error).toBeNull();
    expect((audit.data!.before as Record<string, unknown>).status).toBe('lead');
    expect((audit.data!.after as Record<string, unknown>).status).toBe('active');
    expect(audit.data!.source_message_id).toBe(sourceMessageId);
    // 3. proposal status flip
    expect(await proposalStatus(pid)).toBe('applied');
  });

  it('rolls back ALL writes when a later change fails (all-or-nothing)', async () => {
    const rid = await seedPerson({ full_name: 'Atomic Two', status: 'lead' });
    const { proposalId: pid } = await pendingProposal([
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
    ]);
    const missing = randomUUID(); // a record that does not exist

    const { error } = await callApply(service, pid, [
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
      { op: 'update', objectApiName: 'person', recordId: missing, values: { status: 'active' } },
    ]);

    // The second change raises; the whole call fails.
    expect(error).not.toBeNull();

    // Zero of the three writes survived: the first change's record write and its
    // audit event were rolled back, and the proposal is still pending.
    expect((await recordData(rid)).status).toBe('lead');
    expect(await auditCount(pid)).toBe(0);
    expect(await proposalStatus(pid)).toBe('pending');
  });

  it('forbids an authenticated user from executing the function', async () => {
    const anon = createAnonClient(env.url, env.anonKey);
    const signin = await anon.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
    expect(signin.data.session).not.toBeNull();
    const asUser = createUserClient(env.url, env.anonKey, signin.data.session!.access_token);

    const rid = await seedPerson({ full_name: 'Atomic Three', status: 'lead' });
    const { proposalId: pid } = await pendingProposal([
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
    ]);

    const { error } = await callApply(asUser, pid, [
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
    ]);
    // EXECUTE is service-role only, so the authenticated caller is refused.
    expect(error).not.toBeNull();
    // And nothing was applied.
    expect((await recordData(rid)).status).toBe('lead');
    expect(await proposalStatus(pid)).toBe('pending');
  });
});
