import { describe, expect, it } from 'vitest';
import { hermesUrlFor, loadConfig } from '../src/config.js';

/**
 * The per-agent-kind gateway URL split (ADR-0016 seam): one control plane can
 * drive the authoring gateway and the ops gateway at once, and a deployment
 * with a single gateway keeps working through the HERMES_URL fallback. Pure
 * config logic; no database.
 */
const BASE = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_JWT_SECRET: 'a-jwt-secret-at-least-32-characters-long',
};

describe('hermes per-kind gateway URLs', () => {
  it('falls back to HERMES_URL for both kinds', () => {
    const config = loadConfig({ ...BASE, HERMES_URL: 'http://127.0.0.1:8644' });
    expect(hermesUrlFor(config, 'authoring')).toBe('http://127.0.0.1:8644');
    expect(hermesUrlFor(config, 'operations')).toBe('http://127.0.0.1:8644');
  });

  it('per-kind URLs win over the fallback', () => {
    const config = loadConfig({
      ...BASE,
      HERMES_URL: 'http://127.0.0.1:9999',
      HERMES_AUTHORING_URL: 'http://127.0.0.1:8644',
      HERMES_OPS_URL: 'http://127.0.0.1:8645',
    });
    expect(hermesUrlFor(config, 'authoring')).toBe('http://127.0.0.1:8644');
    expect(hermesUrlFor(config, 'operations')).toBe('http://127.0.0.1:8645');
  });

  it('per-kind URLs work with no HERMES_URL at all', () => {
    const config = loadConfig({
      ...BASE,
      HERMES_AUTHORING_URL: 'http://127.0.0.1:8644',
      HERMES_OPS_URL: 'http://127.0.0.1:8645',
    });
    expect(hermesUrlFor(config, 'authoring')).toBe('http://127.0.0.1:8644');
    expect(hermesUrlFor(config, 'operations')).toBe('http://127.0.0.1:8645');
  });

  it('nothing configured resolves to undefined (the 503 posture)', () => {
    const config = loadConfig(BASE);
    expect(hermesUrlFor(config, 'authoring')).toBeUndefined();
    expect(hermesUrlFor(config, 'operations')).toBeUndefined();
  });
});
