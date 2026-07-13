import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { parseContract } from '@cormac/contract';
import { createServiceClient, type Db } from '../src/db.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import type { RuntimeClient } from '../src/runtime/types.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The human write path (ADR-0014): POST /records/commit. Unlike the agent gate,
 * this validates for HUMAN editability and auto-applies (the user's Save is the
 * confirmation). This suite proves the three things that make it safe: the
 * `edit_records` authorization (a member is refused), human-editability
 * (`editableByUser`, distinct from the agent's), and an atomic apply audited as
 * a user/`web` change carrying `created_by`. Skips without local Supabase.
 */
const env = requireSupabaseEnv();

// internal_rating is human-only (editableByAgent:false, editableByUser:true): the
// agent gate forbids it, the human commit gate must allow it. system_id is fully
// read-only (editableByUser:false): the human gate must refuse it.
const CONTRACT = parseContract({
  name: 'Commit Test Contract',
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
          enumOptions: ['lead', 'active', 'dormant'],
          editableByUser: true,
          editableByAgent: true,
        },
        {
          fieldId: 'fld_internal_rating',
          apiName: 'internal_rating',
          label: 'Internal rating',
          type: 'number',
          editableByUser: true,
          editableByAgent: false,
        },
        {
          fieldId: 'fld_system_id',
          apiName: 'system_id',
          label: 'System id',
          type: 'string',
          editableByUser: false,
          editableByAgent: false,
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

describe.skipIf(!env.ready)('POST /records/commit — human direct edits (ADR-0014)', () => {
  let service: Db;
  let server: FastifyInstance;
  let ownerWs: string;
  let ownerUserId: string;
  let ownerToken: string;
  let recordId: string;
  let memberWs: string;
  let memberToken: string;
  const resources = new TestResources();

  const commit = (ws: string, token: string, body: object) =>
    server.inject({
      method: 'POST',
      url: `/api/workspaces/${ws}/records/commit`,
      headers: bearer(token),
      payload: body,
    });

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);

    const owner = await seedWorkspace(service, resources, {
      namePrefix: 'commit',
      contract: CONTRACT,
    });
    ownerWs = owner.workspaceId;
    ownerUserId = owner.userId;
    ownerToken = await mintToken(owner.userId);

    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: ownerWs,
        object_api_name: 'person',
        contract_version_id: owner.contractVersionId,
        data: { full_name: 'Dana Commit', status: 'lead' },
      })
      .select('id')
      .single();
    recordId = rec.data!.id as string;

    // A separate workspace where the seeded user is a plain member (no edit_records).
    const member = await seedWorkspace(service, resources, {
      namePrefix: 'commit-mbr',
      role: 'member',
      contract: CONTRACT,
    });
    memberWs = member.workspaceId;
    memberToken = await mintToken(member.userId);

    server = await buildServer(loadConfig(), noRuntime);
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('applies a human edit and audits it as a user/web change carrying created_by', async () => {
    const res = await commit(ownerWs, ownerToken, {
      changes: [{ op: 'update', objectApiName: 'person', recordId, values: { status: 'active' } }],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied[0].recordId).toBe(recordId);

    const after = await service.from('business_records').select('data').eq('id', recordId).single();
    expect((after.data!.data as Record<string, unknown>).status).toBe('active');

    // The proposal was authored by the user (created_by non-null) and applied.
    const prop = await service
      .from('agent_proposals')
      .select('created_by, status, source_message_id')
      .eq('id', body.proposalId)
      .single();
    expect(prop.data!.created_by).toBe(ownerUserId);
    expect(prop.data!.status).toBe('applied');
    const sm = await service
      .from('source_messages')
      .select('channel')
      .eq('id', prop.data!.source_message_id)
      .single();
    expect(sm.data!.channel).toBe('web');

    // The audit trail carries the before/after linked to this proposal.
    const audit = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${ownerWs}/audit`,
      headers: bearer(ownerToken),
    });
    const events = audit.json().events as Array<Record<string, unknown>>;
    const updated = events.find(
      (e) => e.action === 'record_updated' && e.proposal_id === body.proposalId,
    );
    expect(updated).toBeDefined();
    expect((updated!.before as Record<string, unknown>).status).toBe('lead');
    expect((updated!.after as Record<string, unknown>).status).toBe('active');
  });

  it('lets a human write a human-only field the agent may not (editableByUser)', async () => {
    const res = await commit(ownerWs, ownerToken, {
      changes: [
        { op: 'update', objectApiName: 'person', recordId, values: { internal_rating: 9 } },
      ],
    });
    expect(res.statusCode).toBe(200);
    const after = await service.from('business_records').select('data').eq('id', recordId).single();
    expect((after.data!.data as Record<string, unknown>).internal_rating).toBe(9);
  });

  it('refuses a field that is not user-editable', async () => {
    const res = await commit(ownerWs, ownerToken, {
      changes: [{ op: 'update', objectApiName: 'person', recordId, values: { system_id: 'x' } }],
    });
    expect(res.statusCode).toBe(422);
  });

  it('creates a record via commit (the import op) and audits it as a create', async () => {
    const res = await commit(ownerWs, ownerToken, {
      changes: [
        { op: 'create', objectApiName: 'person', values: { full_name: 'Imported Person', status: 'lead' } },
      ],
      channel: 'excel',
      note: 'import test',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied[0].op).toBe('create');
    const created = await service
      .from('business_records')
      .select('data')
      .eq('id', body.applied[0].recordId)
      .single();
    expect((created.data!.data as Record<string, unknown>).full_name).toBe('Imported Person');
  });

  it('forbids a member who lacks edit_records', async () => {
    const res = await commit(memberWs, memberToken, {
      changes: [{ op: 'create', objectApiName: 'person', values: { full_name: 'Nope' } }],
    });
    expect(res.statusCode).toBe(403);
  });
});
