import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createAnonClient, createServiceClient, createUserClient, type Db } from '@cormac/db';
import { TestResources } from './helpers.js';

/**
 * The first-class isolation test (ADR-003, ADR-015). It proves two things at the
 * database, not in application logic:
 *   1. Tenant isolation: a user in workspace B cannot read or write workspace
 *      A's rows under RLS.
 *   2. Append-only audit: audit_events cannot be updated or deleted, even by the
 *      service role, because the trigger fires for everyone.
 *
 * Skipped automatically unless local Supabase env is present, so unit-only runs
 * stay green. CI starts Supabase and provides these.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const ready = Boolean(url && serviceKey && anonKey);

describe.skipIf(!ready)('cross-tenant isolation and append-only audit', () => {
  let service: Db;
  let userB: Db;
  let workspaceA: string;
  let recordAId: string;
  const resources = new TestResources();

  beforeAll(async () => {
    service = createServiceClient(url!, serviceKey!);

    // Two workspaces.
    const wsA = await service.from('workspaces').insert({ name: `A-${randomUUID()}` }).select('id').single();
    const wsB = await service.from('workspaces').insert({ name: `B-${randomUUID()}` }).select('id').single();
    if (wsA.error || wsB.error) throw new Error('failed to create workspaces');
    workspaceA = resources.workspace(wsA.data.id as string);
    const workspaceB = resources.workspace(wsB.data.id as string);

    // A user who belongs only to workspace B.
    const emailB = `b-${randomUUID()}@isolation.test`;
    const passwordB = `pw-${randomUUID()}`;
    const created = await service.auth.admin.createUser({
      email: emailB,
      password: passwordB,
      email_confirm: true,
    });
    if (!created.data.user) throw new Error(`createUser failed: ${created.error?.message}`);
    resources.user(created.data.user.id);
    await service
      .from('memberships')
      .insert({ workspace_id: workspaceB, user_id: created.data.user.id, role: 'owner' });

    // Publish a contract for A and put one record in A.
    const cv = await service
      .from('contract_versions')
      .insert({
        workspace_id: workspaceA,
        version: 1,
        document: EXAMPLE_PERSON_CONTRACT,
        is_active: true,
      })
      .select('id')
      .single();
    if (cv.error) throw new Error(`publish contract: ${cv.error.message}`);
    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceA,
        object_api_name: 'person',
        contract_version_id: cv.data.id,
        data: { full_name: 'Secret Person', status: 'lead' },
      })
      .select('id')
      .single();
    if (rec.error) throw new Error(`seed record: ${rec.error.message}`);
    recordAId = rec.data.id as string;

    // Sign in as user B and build an RLS-constrained client.
    const anon = createAnonClient(url!, anonKey!);
    const signin = await anon.auth.signInWithPassword({ email: emailB, password: passwordB });
    if (!signin.data.session) throw new Error(`sign-in failed: ${signin.error?.message}`);
    userB = createUserClient(url!, anonKey!, signin.data.session.access_token);
  });

  afterAll(async () => {
    await resources.cleanup(service);
  });

  it('lets the service role read workspace A (sanity)', async () => {
    const { data, error } = await service
      .from('business_records')
      .select('id')
      .eq('id', recordAId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(recordAId);
  });

  it("hides workspace A's records from a workspace B user", async () => {
    const { data, error } = await userB.from('business_records').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("cannot fetch workspace A's record by id as a workspace B user", async () => {
    const { data } = await userB.from('business_records').select('*').eq('id', recordAId);
    expect(data).toEqual([]);
  });

  it('blocks a workspace B user from writing into workspace A', async () => {
    const { error } = await userB.from('business_records').insert({
      workspace_id: workspaceA,
      object_api_name: 'person',
      contract_version_id: randomUUID(),
      data: { full_name: 'Injected' },
    });
    expect(error).not.toBeNull();
  });

  it("hides workspace A's learned knowledge from a workspace B user, and blocks writing it", async () => {
    // A learned item in workspace A (service role is the only writer).
    const seeded = await service
      .from('learned_knowledge')
      .insert({
        workspace_id: workspaceA,
        kind: 'enum_synonym',
        payload: { objectApiName: 'person', fieldApiName: 'status', synonym: 'prospect', canonicalOption: 'lead' },
      })
      .select('id')
      .single();
    expect(seeded.error).toBeNull();

    const read = await userB.from('learned_knowledge').select('*');
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const write = await userB.from('learned_knowledge').insert({
      workspace_id: workspaceA,
      kind: 'enum_synonym',
      payload: { objectApiName: 'person', fieldApiName: 'status', synonym: 'injected', canonicalOption: 'lead' },
    });
    expect(write.error).not.toBeNull();
  });

  it('forbids updating or deleting an audit event, even as the service role', async () => {
    const inserted = await service
      .from('audit_events')
      .insert({ workspace_id: workspaceA, actor_type: 'agent', action: 'isolation_probe' })
      .select('id')
      .single();
    expect(inserted.error).toBeNull();
    const id = inserted.data!.id as string;

    const updated = await service.from('audit_events').update({ action: 'tampered' }).eq('id', id);
    expect(updated.error).not.toBeNull();

    const deleted = await service.from('audit_events').delete().eq('id', id);
    expect(deleted.error).not.toBeNull();
  });
});
