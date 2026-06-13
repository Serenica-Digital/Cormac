import 'dotenv/config';
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createServiceClient, type Db } from '@cormac/db';
import { propose } from '../services/runtime-stub/src/propose.js';
import { loadConfig } from '../apps/api/src/config.js';
import { buildServer } from '../apps/api/src/server.js';
import { TestResources } from './helpers.js';

/**
 * The SSE probe route over a REAL socket (the unit test in apps/api covers the
 * envelope and the auth gating via inject, but inject cannot exercise
 * reply.hijack(), the SSE headers, or actual streaming). This closes the plan's
 * "401/403 before the stream opens" bar end to end and proves the transport
 * wiring. Uses the real runtime-stub logic behind a local HTTP server, against a
 * real DB. Skips without local Supabase, like the other integration tests.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && serviceKey);

describe.skipIf(!ready)('SSE capture stream over a real socket', () => {
  let runtime: http.Server;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let service: Db;
  let base: string;
  let workspaceId: string;
  let memberToken: string;
  let nonMemberToken: string;
  const resources = new TestResources();

  beforeAll(async () => {
    // A local fake runtime running the real stub propose logic.
    runtime = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const out = propose(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
      });
    });
    await new Promise<void>((resolve) => runtime.listen(0, '127.0.0.1', resolve));
    const raddr = runtime.address();
    if (!raddr || typeof raddr === 'string') throw new Error('no runtime address');

    // Build config explicitly (no process.env mutation, so the probe flag does
    // not leak into other test files' servers).
    const config = loadConfig({
      ...process.env,
      SSE_PROBE_ENABLED: 'true',
      RUNTIME_KIND: 'stub',
      RUNTIME_URL: `http://127.0.0.1:${raddr.port}`,
    });

    service = createServiceClient(url!, serviceKey!);

    const ws = await service.from('workspaces').insert({ name: `sse-${randomUUID()}` }).select('id').single();
    workspaceId = resources.workspace(ws.data!.id as string);

    const member = await service.auth.admin.createUser({
      email: `sse-m-${randomUUID()}@test.local`,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    const memberId = resources.user(member.data.user!.id);
    await service.from('memberships').insert({ workspace_id: workspaceId, user_id: memberId, role: 'owner' });

    // A second user who is NOT a member of this workspace (the 403 case).
    const stranger = await service.auth.admin.createUser({
      email: `sse-x-${randomUUID()}@test.local`,
      password: `pw-${randomUUID()}`,
      email_confirm: true,
    });
    const strangerId = resources.user(stranger.data.user!.id);

    const cv = await service
      .from('contract_versions')
      .insert({ workspace_id: workspaceId, version: 1, document: EXAMPLE_PERSON_CONTRACT, is_active: true })
      .select('id')
      .single();
    await service.from('business_records').insert({
      workspace_id: workspaceId,
      object_api_name: 'person',
      contract_version_id: cv.data!.id,
      data: { full_name: 'John Carter', email: 'john@carterdeals.test', status: 'lead' },
    });

    // Mint an HS256 token the route's authenticate() accepts (it verifies HS256
    // against config.SUPABASE_JWT_SECRET; ADR-020). Hand-rolled with node:crypto
    // so this root-level test needs no jose dependency.
    const issuer = config.SUPABASE_AUTH_ISSUER ?? `${config.SUPABASE_URL}/auth/v1`;
    const sign = (sub: string): string => {
      const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const head = enc({ alg: 'HS256', typ: 'JWT' });
      const payload = enc({ sub, iss: issuer, aud: 'authenticated', iat: now, exp: now + 300 });
      const data = `${head}.${payload}`;
      const sig = createHmac('sha256', config.SUPABASE_JWT_SECRET).update(data).digest('base64url');
      return `${data}.${sig}`;
    };
    memberToken = sign(memberId);
    nonMemberToken = sign(strangerId);

    server = await buildServer(config);
    await server.listen({ port: 0, host: '127.0.0.1' });
    const saddr = server.server.address();
    if (!saddr || typeof saddr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${saddr.port}`;
  });

  afterAll(async () => {
    await server?.close();
    runtime?.close();
    await resources.cleanup(service);
  });

  const streamUrl = (text: string) =>
    `${base}/api/workspaces/${workspaceId}/capture/stream?text=${encodeURIComponent(text)}`;

  it('streams received -> progress -> result -> done with event-stream headers', async () => {
    const res = await fetch(streamUrl('Talked to John about the waterfront deal, he is interested.'), {
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-transform');

    const body = await res.text();
    const events = [...body.matchAll(/event: (\w+)/g)].map((m) => m[1]);
    expect(events[0]).toBe('received');
    expect(events).toContain('progress');
    expect(events).toContain('result');
    expect(events.at(-1)).toBe('done');
  });

  it('rejects a non-member with 403 before opening the stream', async () => {
    const res = await fetch(streamUrl('hi'), { headers: { authorization: `Bearer ${nonMemberToken}` } });
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type') ?? '').not.toContain('text/event-stream');
    await res.body?.cancel();
  });

  it('rejects an empty text with 400 before opening the stream', async () => {
    const res = await fetch(`${base}/api/workspaces/${workspaceId}/capture/stream?text=`, {
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.status).toBe(400);
    await res.body?.cancel();
  });

  it('rejects a missing token with 401', async () => {
    const res = await fetch(streamUrl('hi'));
    expect(res.status).toBe(401);
    await res.body?.cancel();
  });
});
