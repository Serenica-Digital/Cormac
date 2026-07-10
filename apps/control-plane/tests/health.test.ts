import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { buildServer } from '../src/server.js';

/**
 * The health probes are the only unauthenticated endpoints on the control
 * plane (control register: deployment probes row). Pure unit test: no
 * Supabase, no network — buildServer only constructs clients.
 */
describe('health probes', () => {
  const config = loadConfig({
    APP_ENV: 'test',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_JWT_SECRET: 'a-test-secret-of-at-least-32-characters',
  });

  it('GET /health answers 200 with no auth header', async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('GET /api/health answers 200 with no auth header', async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
