import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { parseContract } from '@cormac/contract';
import { createServiceClient, type Db } from '../src/db.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import type { RuntimeClient } from '../src/runtime/types.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * Per-change proposal decisions (#114): POST /proposals/:id/decision with
 * `keep` applies only the named changes and drops the rest. This suite proves
 * the gate's edges: the kept subset applies atomically while dropped changes
 * write NOTHING (and land on the audit trail as proposal_changes_dropped);
 * only the kept subset is validated, so a bad dropped change cannot block a
 * good kept one; malformed `keep` is refused. Control-register row 28.
 * Skips without local Supabase.
 */
const env = requireSupabaseEnv();

const CONTRACT = parseContract({
  name: 'Partial Decision Contract',
  version: 1,
  objects: [
    {
      objectId: 'obj_person',
      apiName: 'person',
      label: 'Person',
      identity: { displayFields: ['full_name'] },
      fields: [
        {
          fieldId: 'fld_full_name',
          apiName: 'full_name',
          label: 'Full name',
          type: 'string',
          required: true,
          editableByUser: true,
          editableByAgent: true,
        },
        {
          fieldId: 'fld_status',
          apiName: 'status',
          label: 'Status',
          type: 'enum',
          enumOptions: ['lead', 'active'],
          editableByUser: true,
          editableByAgent: true,
        },
      ],
    },
  ],
});

const noRuntime: RuntimeClient = {
  async runCaptureTask() {
    throw new Error('not used in this suite');
  },
  async sendAuthoringTurn() {
    throw new Error('not used in this suite');
  },
};

const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

interface ChangeInput {
  op: 'create' | 'update';
  objectApiName: string;
  recordId?: string;
  values: Record<string, unknown>;
}

describe.skipIf(!env.ready)('POST /proposals/:id/decision — per-change decisions (#114)', () => {
  let service: Db;
  let server: FastifyInstance;
  let ws: string;
  let ownerToken: string;
  let contractVersionId: string;
  const resources = new TestResources();

  async function seedPerson(data: Record<string, unknown>): Promise<string> {
    const res = await service
      .from('business_records')
      .insert({
        workspace_id: ws,
        object_api_name: 'person',
        contract_version_id: contractVersionId,
        data,
      })
      .select('id')
      .single();
    if (res.error) throw new Error(`seedPerson: ${res.error.message}`);
    return res.data.id as string;
  }

  async function pendingProposal(changes: ChangeInput[]): Promise<string> {
    const sm = await service
      .from('source_messages')
      .insert({ workspace_id: ws, channel: 'sms', user_id: null, content: 'partial test' })
      .select('id')
      .single();
    if (sm.error) throw new Error(`source message: ${sm.error.message}`);
    const res = await service
      .from('agent_proposals')
      .insert({
        workspace_id: ws,
        source_message_id: sm.data.id,
        status: 'pending',
        payload: { changes, uncertain: false },
        created_by: null,
      })
      .select('id')
      .single();
    if (res.error) throw new Error(`proposal: ${res.error.message}`);
    return res.data.id as string;
  }

  const decide = (proposalId: string, body: object) =>
    server.inject({
      method: 'POST',
      url: `/api/workspaces/${ws}/proposals/${proposalId}/decision`,
      headers: bearer(ownerToken),
      payload: body,
    });

  async function personCount(fullName: string): Promise<number> {
    const res = await service
      .from('business_records')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', ws)
      .eq('object_api_name', 'person')
      .contains('data', { full_name: fullName });
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, {
      namePrefix: 'partial',
      contract: CONTRACT,
    });
    ws = seed.workspaceId;
    contractVersionId = seed.contractVersionId;
    ownerToken = await mintToken(seed.userId);
    server = await buildServer(loadConfig(), noRuntime);
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('applies the kept change, writes nothing for the dropped one, and audits the drop', async () => {
    const rid = await seedPerson({ full_name: 'Keep Kara', status: 'lead' });
    const pid = await pendingProposal([
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
      { op: 'create', objectApiName: 'person', values: { full_name: 'Dropped Dave' } },
    ]);

    const res = await decide(pid, { decision: 'approve', keep: [0] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('applied');
    expect(body.applied).toHaveLength(1);
    expect(body.droppedCount).toBe(1);

    // Kept change landed; the dropped create wrote nothing.
    const after = await service.from('business_records').select('data').eq('id', rid).single();
    expect((after.data!.data as Record<string, unknown>).status).toBe('active');
    expect(await personCount('Dropped Dave')).toBe(0);

    // Status flipped, and the drop is on the audit trail with the dropped changes.
    const prop = await service.from('agent_proposals').select('status').eq('id', pid).single();
    expect(prop.data!.status).toBe('applied');
    const dropAudit = await service
      .from('audit_events')
      .select('after')
      .eq('proposal_id', pid)
      .eq('action', 'proposal_changes_dropped')
      .single();
    expect(dropAudit.error).toBeNull();
    const droppedChanges = (dropAudit.data!.after as { dropped: ChangeInput[] }).dropped;
    expect(droppedChanges).toHaveLength(1);
    expect(droppedChanges[0]!.values.full_name).toBe('Dropped Dave');
  });

  it('validates only the kept subset: a contract-invalid dropped change cannot block it', async () => {
    const rid = await seedPerson({ full_name: 'Solo Sam', status: 'lead' });
    const pid = await pendingProposal([
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
      // Unknown field: a full approve of this proposal would fail validation.
      { op: 'update', objectApiName: 'person', recordId: rid, values: { not_a_field: true } },
    ]);

    const full = await decide(pid, { decision: 'approve' });
    expect(full.statusCode).toBe(422);

    const partial = await decide(pid, { decision: 'approve', keep: [0] });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().droppedCount).toBe(1);
    const after = await service.from('business_records').select('data').eq('id', rid).single();
    expect((after.data!.data as Record<string, unknown>).status).toBe('active');
  });

  it('refuses malformed keep: out-of-range index, empty list, keep on reject', async () => {
    const rid = await seedPerson({ full_name: 'Edge Ed', status: 'lead' });
    const changes: ChangeInput[] = [
      { op: 'update', objectApiName: 'person', recordId: rid, values: { status: 'active' } },
    ];
    const pid = await pendingProposal(changes);

    expect((await decide(pid, { decision: 'approve', keep: [5] })).statusCode).toBe(400);
    expect((await decide(pid, { decision: 'approve', keep: [] })).statusCode).toBe(400);
    expect((await decide(pid, { decision: 'reject', keep: [0] })).statusCode).toBe(400);

    // Nothing was written and the proposal is still decidable.
    const rec = await service.from('business_records').select('data').eq('id', rid).single();
    expect((rec.data!.data as Record<string, unknown>).status).toBe('lead');
    const prop = await service.from('agent_proposals').select('status').eq('id', pid).single();
    expect(prop.data!.status).toBe('pending');

    // A full approve still works afterward, with nothing dropped.
    const ok = await decide(pid, { decision: 'approve' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().droppedCount).toBe(0);
  });
});
