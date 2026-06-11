import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProblemError } from '@serenica/shared';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

/**
 * Server-boundary controls, no database needed: the CORS allowlist (#3), the
 * JWT audience check (#4), and the error-detail scrub (#6). Runs entirely via
 * fastify.inject against locally signed HS256 tokens and injected routes.
 */
const TEST_ENV = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SUPABASE_JWT_SECRET: 'test-secret-with-at-least-32-characters!',
  CORS_ORIGINS: 'http://allowed.test',
  RUNTIME_KIND: 'stub',
} as NodeJS.ProcessEnv;

const config = loadConfig({ ...process.env, ...TEST_ENV });
const hsSecret = new TextEncoder().encode(config.SUPABASE_JWT_SECRET);

function signToken(aud: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(`${config.SUPABASE_URL}/auth/v1`)
    .setAudience(aud)
    .setSubject('00000000-0000-4000-8000-0000000000aa')
    .setExpirationTime('5m')
    .sign(hsSecret);
}

describe('server boundary controls', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer(config);
    // Routes that throw the two ProblemError shapes the scrub distinguishes.
    server.get('/boom-upstream', () => {
      throw new ProblemError(502, 'runtime_error', 'Agent runtime returned 500', 'raw upstream text');
    });
    server.get('/boom-client', () => {
      throw new ProblemError(422, 'proposal_invalid', 'Proposal rejected', 'field x is human-only');
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('sets CORS headers for an allowlisted origin', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { origin: 'http://allowed.test', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test');
  });

  it('sets no CORS headers for an origin off the list', async () => {
    const res = await server.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { origin: 'http://evil.test', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a token whose audience is not "authenticated"', async () => {
    const token = await signToken('wrong-audience');
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/00000000-0000-4000-8000-000000000001/proposals',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('scrubs 5xx ProblemError detail from the response', async () => {
    const res = await server.inject({ method: 'GET', url: '/boom-upstream' });
    expect(res.statusCode).toBe(502);
    const body = res.json() as Record<string, unknown>;
    expect(body.error).toBe('runtime_error');
    expect(body.detail).toBeUndefined();
    expect(res.payload).not.toContain('raw upstream text');
  });

  it('passes 4xx ProblemError detail through to the caller', async () => {
    const res = await server.inject({ method: 'GET', url: '/boom-client' });
    expect(res.statusCode).toBe(422);
    expect((res.json() as Record<string, unknown>).detail).toBe('field x is human-only');
  });
});
