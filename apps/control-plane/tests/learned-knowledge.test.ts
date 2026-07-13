import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '../src/db.js';
import { hashAgentToken } from '../src/auth.js';
import type { AgentKind } from '../src/shared.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { compileWorkspaceContextFromDb } from '../src/pipeline/context.js';
import { mintToken, requireSupabaseEnv, seedWorkspace, TestResources } from './helpers.js';

/**
 * Governed learning (the knowledge-layer spike). What this suite proves:
 * the agent can only STAGE a typed fact (propose_learning), never make it
 * knowledge by itself; a human decision flips it; only approved rows enter
 * the compiled context, byte-stably; everything is contract-validated before
 * it is held; and recall (/agent/history) is capability-gated and bounded.
 * Skips without local Supabase.
 */
const env = requireSupabaseEnv();

describe.skipIf(!env.ready)('governed learning + recall', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let workspaceId: string;
  let contractDoc: Record<string, unknown>;
  let ownerToken: string;
  let recordId: string;
  let sourceMessageId: string;
  const raw: Record<AgentKind, string> = { authoring: '', operations: '' };
  const resources = new TestResources();

  async function mintAgent(ws: string, agent: AgentKind): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const { error } = await service
      .from('agent_tokens')
      .insert({ workspace_id: ws, agent, token_hash: hashAgentToken(token) });
    if (error) throw new Error(`mintAgent: ${error.message}`);
    return token;
  }

  const bearer = (t: string) => ({
    authorization: `Bearer ${t}`,
    'content-type': 'application/json',
  });

  beforeAll(async () => {
    service = createServiceClient(env.url, env.serviceKey);
    const seed = await seedWorkspace(service, resources, { namePrefix: 'learn' });
    workspaceId = seed.workspaceId;
    ownerToken = await mintToken(seed.userId);

    raw.authoring = await mintAgent(workspaceId, 'authoring');
    raw.operations = await mintAgent(workspaceId, 'operations');

    const cv = await service
      .from('contract_versions')
      .select('document')
      .eq('id', seed.contractVersionId)
      .single();
    contractDoc = cv.data!.document as Record<string, unknown>;

    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: seed.contractVersionId,
        data: { full_name: 'Morgan Ellis', status: 'active' },
      })
      .select('id')
      .single();
    recordId = rec.data!.id as string;

    const msg = await service
      .from('source_messages')
      .insert({
        workspace_id: workspaceId,
        channel: 'web',
        user_id: seed.userId,
        content: 'Met with Mo yesterday, she is keen on the lakeside listing',
      })
      .select('id')
      .single();
    sourceMessageId = msg.data!.id as string;

    server = await buildServer(loadConfig());
  });

  afterAll(async () => {
    await server.close();
    await resources.cleanup(service);
  });

  it('privilege split: an authoring token reaches neither learning nor history', async () => {
    const propose = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.authoring),
      payload: {
        kind: 'alias',
        taskId: sourceMessageId,
        objectApiName: 'person',
        recordId,
        variant: 'Mo',
      },
    });
    expect(propose.statusCode).toBe(403);

    const history = await server.inject({
      method: 'GET',
      url: '/agent/history?query=lakeside',
      headers: bearer(raw.authoring),
    });
    expect(history.statusCode).toBe(403);
  });

  it('validates against the contract before holding anything', async () => {
    const badObject = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.operations),
      payload: {
        kind: 'alias',
        taskId: sourceMessageId,
        objectApiName: 'ghost',
        recordId,
        variant: 'Mo',
      },
    });
    expect(badObject.statusCode).toBe(422);

    const badOption = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.operations),
      payload: {
        kind: 'enum_synonym',
        taskId: sourceMessageId,
        objectApiName: 'person',
        fieldApiName: 'status',
        synonym: 'hot',
        canonicalOption: 'on_fire',
      },
    });
    expect(badOption.statusCode).toBe(422);

    const notEnum = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.operations),
      payload: {
        kind: 'enum_synonym',
        taskId: sourceMessageId,
        objectApiName: 'person',
        fieldApiName: 'full_name',
        synonym: 'hot',
        canonicalOption: 'active',
      },
    });
    expect(notEnum.statusCode).toBe(422);

    const fakeTask = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.operations),
      payload: {
        kind: 'alias',
        taskId: randomUUID(),
        objectApiName: 'person',
        recordId,
        variant: 'Mo',
      },
    });
    expect(fakeTask.statusCode).toBe(404);
  });

  it('propose -> pending -> approve -> compiled into the context prefix, byte-stably', async () => {
    // Before anything is learned: the context renders the empty marker.
    const before = await compileWorkspaceContextFromDb(
      service,
      workspaceId,
      contractDoc as never,
    );
    expect(before).toContain('== LEARNED KNOWLEDGE ==');
    expect(before).toContain('(none)');

    const propose = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.operations),
      payload: {
        kind: 'alias',
        taskId: sourceMessageId,
        objectApiName: 'person',
        recordId,
        variant: 'Mo',
        rationale: 'The owner refers to Morgan Ellis as Mo',
      },
    });
    expect(propose.statusCode).toBe(200);
    const learningId = propose.json().learningId as string;
    expect(propose.json().status).toBe('pending');

    // Identical re-propose is idempotent, not an error (the agent may notice twice).
    const again = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.operations),
      payload: {
        kind: 'alias',
        taskId: sourceMessageId,
        objectApiName: 'person',
        recordId,
        variant: 'mo',
      },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe('already_known');

    // Pending rows are visible to the human review surface and NOT compiled.
    const pendingList = await server.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/learning?status=pending`,
      headers: bearer(ownerToken),
    });
    expect(pendingList.statusCode).toBe(200);
    expect(pendingList.json().learning).toHaveLength(1);

    const stillBefore = await compileWorkspaceContextFromDb(
      service,
      workspaceId,
      contractDoc as never,
    );
    expect(stillBefore).toContain('(none)');

    // Approve, then the fact enters the compiled prefix.
    const decide = await server.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/learning/${learningId}/decision`,
      headers: bearer(ownerToken),
      payload: { decision: 'approve' },
    });
    expect(decide.statusCode).toBe(200);
    expect(decide.json().status).toBe('approved');

    const after = await compileWorkspaceContextFromDb(service, workspaceId, contractDoc as never);
    expect(after).toContain('alias: "Mo" -> Morgan Ellis (person)');
    // The learned block no longer renders its empty marker (the glossary block
    // legitimately keeps its own).
    expect(after).not.toContain('== LEARNED KNOWLEDGE ==\n(none)');

    // Byte stability: two compiles produce identical bytes.
    const afterAgain = await compileWorkspaceContextFromDb(
      service,
      workspaceId,
      contractDoc as never,
    );
    expect(afterAgain).toBe(after);

    // The decision is audited.
    const audit = await service
      .from('audit_events')
      .select('action, record_id')
      .eq('workspace_id', workspaceId)
      .eq('action', 'learning_approved');
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]!.record_id).toBe(recordId);

    // A settled row cannot be re-decided.
    const redecide = await server.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/learning/${learningId}/decision`,
      headers: bearer(ownerToken),
      payload: { decision: 'reject' },
    });
    expect(redecide.statusCode).toBe(422);
  });

  it('rejected facts never render', async () => {
    const propose = await server.inject({
      method: 'POST',
      url: '/agent/learning',
      headers: bearer(raw.operations),
      payload: {
        kind: 'enum_synonym',
        taskId: sourceMessageId,
        objectApiName: 'person',
        fieldApiName: 'status',
        synonym: 'gone quiet',
        canonicalOption: 'dormant',
      },
    });
    expect(propose.statusCode).toBe(200);
    const learningId = propose.json().learningId as string;

    const decide = await server.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/learning/${learningId}/decision`,
      headers: bearer(ownerToken),
      payload: { decision: 'reject' },
    });
    expect(decide.statusCode).toBe(200);

    const context = await compileWorkspaceContextFromDb(
      service,
      workspaceId,
      contractDoc as never,
    );
    expect(context).not.toContain('gone quiet');
  });

  it('recall: /agent/history finds past messages, bounded and validated', async () => {
    const tooShort = await server.inject({
      method: 'GET',
      url: '/agent/history?query=x',
      headers: bearer(raw.operations),
    });
    expect(tooShort.statusCode).toBe(400);

    const hit = await server.inject({
      method: 'GET',
      url: '/agent/history?query=lakeside',
      headers: bearer(raw.operations),
    });
    expect(hit.statusCode).toBe(200);
    const body = hit.json();
    expect(body.matchCount).toBe(1);
    expect(body.results[0].message).toContain('lakeside listing');
    expect(body.results[0].outcome).toBe('no_proposal');

    const miss = await server.inject({
      method: 'GET',
      url: '/agent/history?query=zzz-never-said',
      headers: bearer(raw.operations),
    });
    expect(miss.json().matchCount).toBe(0);
  });
});
