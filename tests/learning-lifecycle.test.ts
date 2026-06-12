import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createServiceClient, type Db } from '@cormac/db';
import { buildAppContext, type AppContext } from '../apps/api/src/app.js';
import { loadConfig } from '../apps/api/src/config.js';
import { decideLearning, revokeLearning } from '../apps/api/src/pipeline/learning.js';
import {
  getLearnedKnowledge,
  insertLearnedKnowledge,
  listActiveLearnedKnowledge,
} from '../apps/api/src/repo.js';
import type { RequestContext } from '../apps/api/src/types.js';
import { TestResources } from './helpers.js';

/**
 * The learned-knowledge gate (ADR-027 section 4): a proposed item is invisible
 * to the compiled prefix until a human activates it, the status flip and its
 * audit are atomic (decide_learning), revoking reopens the dedup slot, and an
 * item that went stale against the active contract is refused at approval.
 * Skips without local Supabase.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && serviceKey);

describe.skipIf(!ready)('learned-knowledge lifecycle', () => {
  let service: Db;
  let app: AppContext;
  let ctx: RequestContext;
  let workspaceId: string;
  let recordId: string;
  const resources = new TestResources();

  async function aliasPayload(variant: string) {
    return { objectApiName: 'person', recordId, variant };
  }
  async function proposeAlias(variant: string) {
    return insertLearnedKnowledge(service, {
      workspaceId,
      kind: 'alias',
      payload: await aliasPayload(variant),
      recordId,
      sourceMessageId: null,
      proposalId: null,
      proposedBy: null,
    });
  }

  beforeAll(async () => {
    service = createServiceClient(url!, serviceKey!);
    app = buildAppContext(loadConfig());

    const ws = await service.from('workspaces').insert({ name: `learn-${randomUUID()}` }).select('id').single();
    workspaceId = resources.workspace(ws.data!.id as string);
    const user = await service.auth.admin.createUser({
      email: `learn-${randomUUID()}@test.local`,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    const userId = resources.user(user.data.user!.id);
    await service.from('memberships').insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });

    const cv = await service
      .from('contract_versions')
      .insert({ workspace_id: workspaceId, version: 1, document: EXAMPLE_PERSON_CONTRACT, is_active: true })
      .select('id')
      .single();
    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: cv.data!.id,
        data: { full_name: 'John Carter', email: 'john@carterdeals.test', status: 'lead' },
      })
      .select('id')
      .single();
    recordId = rec.data!.id as string;

    ctx = { userId, workspaceId, role: 'owner' };
  });

  afterAll(async () => {
    await resources.cleanup(service);
  });

  it('holds a proposed item out of the active set, then activates it on approval and audits', async () => {
    const proposed = await proposeAlias('Johnny');
    expect(proposed.status).toBe('proposed');

    // Invisible to the prefix: the compiler reads only active items.
    let active = await listActiveLearnedKnowledge(service, workspaceId);
    expect(active.find((r) => r.id === proposed.id)).toBeUndefined();

    const decided = await decideLearning(app, ctx, proposed.id, 'approve');
    expect(decided.status).toBe('active');

    active = await listActiveLearnedKnowledge(service, workspaceId);
    expect(active.find((r) => r.id === proposed.id)).toBeTruthy();

    const audit = await service
      .from('audit_events')
      .select('action')
      .eq('workspace_id', workspaceId)
      .eq('action', 'learning_activated');
    expect((audit.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('refuses to decide an item that is not proposed', async () => {
    const proposed = await proposeAlias('JC');
    await decideLearning(app, ctx, proposed.id, 'approve');
    await expect(decideLearning(app, ctx, proposed.id, 'approve')).rejects.toMatchObject({ status: 400 });
  });

  it('revokes an active item, reopens the dedup slot, and re-propose succeeds', async () => {
    const proposed = await proposeAlias('Jay');
    await decideLearning(app, ctx, proposed.id, 'approve');

    // The live unique index blocks a second live item with the same key.
    await expect(proposeAlias('Jay')).rejects.toThrow();

    const revoked = await revokeLearning(app, ctx, proposed.id);
    expect(revoked.status).toBe('revoked');
    const active = await listActiveLearnedKnowledge(service, workspaceId);
    expect(active.find((r) => r.id === proposed.id)).toBeUndefined();

    // Slot reopened: the same fact can be proposed again.
    const reproposed = await proposeAlias('Jay');
    expect(reproposed.status).toBe('proposed');
  });

  it('rejects a proposed item, closing it without activating', async () => {
    const proposed = await proposeAlias('Jonathan');
    const decided = await decideLearning(app, ctx, proposed.id, 'reject');
    expect(decided.status).toBe('revoked');
    const row = await getLearnedKnowledge(service, workspaceId, proposed.id);
    expect(row!.status).toBe('revoked');
    const audit = await service
      .from('audit_events')
      .select('action')
      .eq('workspace_id', workspaceId)
      .eq('action', 'learning_rejected');
    expect((audit.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('refuses to activate an item that went stale against the active contract', async () => {
    const proposed = await insertLearnedKnowledge(service, {
      workspaceId,
      kind: 'enum_synonym',
      payload: { objectApiName: 'person', fieldApiName: 'status', synonym: 'prospect', canonicalOption: 'lead' },
      recordId: null,
      sourceMessageId: null,
      proposalId: null,
      proposedBy: null,
    });

    // Publish a new active contract whose status options no longer include 'lead'.
    const v2 = structuredClone(EXAMPLE_PERSON_CONTRACT) as typeof EXAMPLE_PERSON_CONTRACT;
    const statusField = v2.objects[0]!.fields.find((f) => f.apiName === 'status')!;
    statusField.enumOptions = ['active', 'dormant'];
    v2.version = 2;
    await service.from('contract_versions').update({ is_active: false }).eq('workspace_id', workspaceId).eq('is_active', true);
    await service
      .from('contract_versions')
      .insert({ workspace_id: workspaceId, version: 2, document: v2, is_active: true });

    await expect(decideLearning(app, ctx, proposed.id, 'approve')).rejects.toMatchObject({ status: 422 });
    const row = await getLearnedKnowledge(service, workspaceId, proposed.id);
    expect(row!.status).toBe('proposed'); // unchanged: nothing was activated
  });
});
