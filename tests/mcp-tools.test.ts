import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceClient, type Db } from '@serenica/db';
import { EXAMPLE_PERSON_CONTRACT } from '@serenica/contract';
import { buildServer } from '../apps/api/src/server.js';
import { loadConfig } from '../apps/api/src/config.js';
import { TestResources } from './helpers.js';

/**
 * The MCP tool surface (ADR-025): the runtime's tools are control-plane
 * endpoints, so the write gate is intrinsic. These tests prove the gate over
 * real HTTP (the MCP transport hijacks the raw response, so fastify.inject
 * cannot be used): bad token rejected, human-only field rejected and not held,
 * a valid proposal held as pending, duplicates blocked, sensitive values
 * redacted from search results. Skips without local Supabase.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && serviceKey);

const MCP_TOKEN = `test-${randomUUID()}`;

interface ToolResult {
  isError?: boolean;
  content?: { type: string; text: string }[];
}

describe.skipIf(!ready)('MCP tool surface', () => {
  let service: Db;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let workspaceId: string;
  let recordId: string;
  let taskId: string;
  const resources = new TestResources();

  async function rpc(method: string, params?: unknown, token: string = MCP_TOKEN) {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const { status, body } = await rpc('tools/call', { name, arguments: args });
    expect(status).toBe(200);
    return (body as { result: ToolResult }).result;
  }

  beforeAll(async () => {
    service = createServiceClient(url!, serviceKey!);

    const ws = await service
      .from('workspaces')
      .insert({ name: `mcp-${randomUUID()}` })
      .select('id')
      .single();
    workspaceId = resources.workspace(ws.data!.id as string);

    await service.from('contract_versions').insert({
      workspace_id: workspaceId,
      version: EXAMPLE_PERSON_CONTRACT.version,
      document: EXAMPLE_PERSON_CONTRACT,
      is_active: true,
    });

    const rec = await service
      .from('business_records')
      .insert({
        workspace_id: workspaceId,
        object_api_name: 'person',
        contract_version_id: (
          await service
            .from('contract_versions')
            .select('id')
            .eq('workspace_id', workspaceId)
            .single()
        ).data!.id,
        data: { full_name: 'Dana Match', email: 'dana@mcp.test', status: 'lead' },
      })
      .select('id')
      .single();
    recordId = rec.data!.id as string;

    const sm = await service
      .from('source_messages')
      .insert({ workspace_id: workspaceId, channel: 'web', content: 'mcp test task' })
      .select('id')
      .single();
    taskId = sm.data!.id as string;

    server = await buildServer(
      loadConfig({
        ...process.env,
        MCP_WORKSPACE_ID: workspaceId,
        MCP_WORKSPACE_TOKEN: MCP_TOKEN,
      }),
    );
    await server.listen({ host: '127.0.0.1', port: 0 });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await server?.close();
    await resources.cleanup(service);
  });

  it('rejects a missing or wrong bearer token', async () => {
    const { status } = await rpc('tools/list', undefined, 'wrong-token');
    expect(status).toBe(401);
  });

  it('lists exactly the operations-agent tools', async () => {
    const { status, body } = await rpc('tools/list');
    expect(status).toBe(200);
    const names = (
      body as { result: { tools: { name: string }[] } }
    ).result.tools.map((t) => t.name);
    expect(names.sort()).toEqual([
      'get_active_contract',
      'get_record',
      'search_records',
      'submit_proposal',
    ]);
  });

  it('search_records matches and redacts sensitive values', async () => {
    const result = await callTool('search_records', { query: 'dana' });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content![0]!.text) as {
      matchCount: number;
      matches: { id: string; display: Record<string, unknown> }[];
    };
    expect(payload.matchCount).toBe(1);
    expect(payload.matches[0]!.id).toBe(recordId);
    expect(payload.matches[0]!.display.full_name).toBe('Dana Match');
    // email is marked sensitive in the contract: never in model context (ADR-015).
    expect(payload.matches[0]!.display.email).toBeUndefined();
  });

  it('rejects a human-only field write and holds nothing', async () => {
    const result = await callTool('submit_proposal', {
      taskId,
      changes: [
        {
          objectApiName: 'person',
          op: 'update',
          recordId,
          values: { internal_rating: 9 },
        },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content![0]!.text).toContain('not agent-editable');

    const held = await service
      .from('agent_proposals')
      .select('id')
      .eq('workspace_id', workspaceId);
    expect(held.data).toHaveLength(0);
  });

  it('holds a valid proposal as pending, then blocks a duplicate for the same task', async () => {
    const result = await callTool('submit_proposal', {
      taskId,
      changes: [
        { objectApiName: 'person', op: 'update', recordId, values: { status: 'active' } },
      ],
      notes: 'test',
      uncertain: false,
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content![0]!.text) as { proposalId: string; status: string };
    expect(payload.status).toBe('pending');

    const dup = await callTool('submit_proposal', {
      taskId,
      changes: [
        { objectApiName: 'person', op: 'update', recordId, values: { status: 'lead' } },
      ],
    });
    expect(dup.isError).toBe(true);
    expect(dup.content![0]!.text).toContain('already exists');
  });

  it('rejects an unknown taskId', async () => {
    const result = await callTool('submit_proposal', {
      taskId: randomUUID(),
      changes: [
        { objectApiName: 'person', op: 'update', recordId, values: { status: 'lead' } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content![0]!.text).toContain('Unknown taskId');
  });
});
