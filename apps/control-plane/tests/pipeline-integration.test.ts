import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServiceClient, type Db } from '../src/db.js';
import { hashAgentToken } from '../src/auth.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import type { CaptureTaskInput, CaptureTaskOutcome, RuntimeClient } from '../src/runtime/types.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * The whole spine, end to end over HTTP: capture -> source message -> the
 * (faked) runtime submits through the REAL /agent/proposals gate with an ops
 * token -> proposal held pending -> human decision -> atomic apply -> audit
 * trail. The fake replaces only the Hermes transport (phase 5); every
 * validation gate it passes through is the production code path. Skips
 * without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('capture -> hold -> decide -> apply pipeline', () => {
  let service: Db;
  let server: FastifyInstance;
  let workspaceId: string;
  let ownerToken: string;
  let opsToken: string;
  let recordId: string;
  const resources = new TestResources();

  // The fake transport: "the agent" reads the task and submits a proposal by
  // calling the real agent endpoint, exactly as a bundled tool would.
  const fakeRuntime: RuntimeClient = {
    async runCaptureTask(input: CaptureTaskInput): Promise<CaptureTaskOutcome> {
      const res = await server.inject({
        method: 'POST',
        url: '/agent/proposals',
        headers: { authorization: `Bearer ${opsToken}`, 'content-type': 'application/json' },
        payload: {
          taskId: input.taskId,
          changes: [
            { op: 'update', objectApiName: 'person', recordId, values: { status: 'active' } },
          ],
          notes: 'closed the deal',
          uncertain: false,
        },
      });
      if (res.statusCode !== 200) throw new Error(`fake runtime submit failed: ${res.body}`);
      return { runId: `fake-${input.taskId}`, output: 'proposal submitted' };
    },
    async sendAuthoringTurn() {
      throw new Error('not part of this test');
    },
  };

  const bearer = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'pipe' });
    workspaceId = seed.workspaceId;
    ownerToken = await mintToken(seed.userId);

    opsToken = randomBytes(32).toString('hex');
    await service.from('agent_tokens').insert({
      workspace_id: workspaceId,
      agent: 'operations',
      token_hash: hashAgentToken(opsToken),
    });

    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: seed.contractVersionId,
        data: { full_name: 'Carter Pipeline', status: 'lead' },
      })
      .select('id')
      .single();
    recordId = rec.data!.id as string;

    server = await buildServer(loadConfig(), { operations: fakeRuntime });
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('runs the spine: held pending, approved, applied atomically, audited', async () => {
    // 1. Capture: the runtime (fake) submits through the real agent gate.
    const capture = await server.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/capture`,
      headers: bearer(ownerToken),
      payload: { text: 'just closed the deal with Carter' },
    });
    expect(capture.statusCode).toBe(200);
    const captured = capture.json();
    expect(captured.status).toBe('pending');
    expect(captured.proposalId).not.toBeNull();
    expect(captured.changeCount).toBe(1);

    // 2. The record is untouched while the proposal is held.
    const held = await service.from('business_records').select('data').eq('id', recordId).single();
    expect((held.data!.data as Record<string, unknown>).status).toBe('lead');

    // 3. The queue shows the held proposal with before/after context.
    const queue = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/proposals?status=pending`,
      headers: bearer(ownerToken),
    });
    expect(queue.statusCode).toBe(200);
    const view = queue.json().proposals.find((p: { id: string }) => p.id === captured.proposalId);
    expect(view).toBeDefined();
    expect(view.changes[0].current.status).toBe('lead');

    // 4. Approve: the atomic apply.
    const decision = await server.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/proposals/${captured.proposalId}/decision`,
      headers: bearer(ownerToken),
      payload: { decision: 'approve' },
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().status).toBe('applied');

    // 5. The write landed and the audit trail links task -> proposal -> record.
    const after = await service.from('business_records').select('data').eq('id', recordId).single();
    expect((after.data!.data as Record<string, unknown>).status).toBe('active');

    const audit = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/audit`,
      headers: bearer(ownerToken),
    });
    const events = audit.json().events as Array<Record<string, unknown>>;
    const updated = events.find(
      (e) => e.action === 'record_updated' && e.proposal_id === captured.proposalId,
    );
    expect(updated).toBeDefined();
    expect((updated!.before as Record<string, unknown>).status).toBe('lead');
    expect((updated!.after as Record<string, unknown>).status).toBe('active');
    expect(updated!.source_message_id).toBe(captured.sourceMessageId);
  });

  it('refuses a proposal that writes a human-only field, at the agent gate', async () => {
    // A capture whose "agent" tries to write internal_rating (editableByAgent: false).
    const evilRuntime: RuntimeClient = {
      async runCaptureTask(input) {
        const res = await server.inject({
          method: 'POST',
          url: '/agent/proposals',
          headers: { authorization: `Bearer ${opsToken}`, 'content-type': 'application/json' },
          payload: {
            taskId: input.taskId,
            changes: [
              { op: 'update', objectApiName: 'person', recordId, values: { internal_rating: 10 } },
            ],
          },
        });
        // The gate must refuse; the run ends with no proposal held.
        expect(res.statusCode).toBe(422);
        return { runId: `fake-${input.taskId}`, output: 'the contract forbids that field' };
      },
      async sendAuthoringTurn() {
        throw new Error('not part of this test');
      },
    };

    const evilServer = await buildServer(loadConfig(), { operations: evilRuntime });
    try {
      const capture = await evilServer.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/capture`,
        headers: bearer(ownerToken),
        payload: { text: 'rate Carter a 10' },
      });
      expect(capture.statusCode).toBe(200);
      expect(capture.json().status).toBe('no_proposal');
      expect(capture.json().proposalId).toBeNull();
    } finally {
      await evilServer.close();
    }
  });
});
