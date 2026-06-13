import { describe, it, expect } from 'vitest';
import { ENV, Z, browserEnvSchema, DEV_JWT_SECRET } from '../../packages/config/src/index.js';
import { enforceProdRules, loadServerEnv, readEnv } from '../../packages/config/src/server.js';
import { loadConfig, API_ENV_KEYS } from '../../apps/api/src/config.js';
import { buildAppContext } from '../../apps/api/src/app.js';

/**
 * The env contract (ADR-034). These bind the manifest to the schemas that derive
 * from it (so they cannot drift) and prove the fail-closed prod posture. The
 * cross-surface drift (manifest <-> .env.example/compose/Helm) is proven
 * separately by scripts/check-env.ts in CI.
 */

describe('manifest integrity', () => {
  it('ENV metadata and Z rules cover exactly the same variables', () => {
    const zKeys = Object.keys(Z).sort();
    const envNames = ENV.map((e) => e.name).sort();
    expect(envNames).toEqual(zKeys);
  });

  it('has no duplicate variable names', () => {
    const names = ENV.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('no secret carries a committed literal default (except the public dev JWT secret)', () => {
    for (const e of ENV.filter((v) => v.secret && v.name !== 'SUPABASE_JWT_SECRET')) {
      const r = Z[e.name].safeParse(undefined);
      // A secret must be required (parse fails) or optional (undefined), never
      // defaulted to a real literal value.
      expect(r.success === false || r.data === undefined).toBe(true);
    }
  });
});

describe('derived schemas stay bound to the manifest', () => {
  it('the browser schema matches the browser-scope manifest entries', () => {
    const schemaKeys = Object.keys(browserEnvSchema.shape).sort();
    const manifest = ENV.filter((e) => e.scope === 'browser').map((e) => e.name).sort();
    expect(schemaKeys).toEqual(manifest);
  });

  it('the api config schema matches the api server-scope manifest entries', () => {
    const manifest = ENV.filter((e) => e.scope === 'server' && e.workloads.includes('api'))
      .map((e) => e.name)
      .sort();
    expect([...API_ENV_KEYS].sort()).toEqual(manifest);
  });
});

describe('fail-closed production rules', () => {
  const ok: Record<string, string | undefined> = {
    APP_ENV: 'prod',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    CORS_ORIGINS: 'https://app.example.com',
    RUNTIME_KIND: 'hermes',
    RUNTIME_API_KEY: 'runtime-key',
    MCP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000001',
    MCP_WORKSPACE_TOKEN: 'x'.repeat(16),
  };

  it('passes when every prod requirement is satisfied', () => {
    expect(() => enforceProdRules('api', ok, 'prod')).not.toThrow();
  });

  it('refuses the public dev JWT secret in prod', () => {
    expect(() => enforceProdRules('api', { ...ok, SUPABASE_JWT_SECRET: DEV_JWT_SECRET }, 'prod')).toThrow();
  });

  it('requires CORS_ORIGINS, the runtime key, and the MCP credentials in prod', () => {
    expect(() => enforceProdRules('api', { ...ok, CORS_ORIGINS: undefined }, 'prod')).toThrow();
    expect(() => enforceProdRules('api', { ...ok, RUNTIME_API_KEY: undefined }, 'prod')).toThrow();
    expect(() => enforceProdRules('api', { ...ok, MCP_WORKSPACE_TOKEN: undefined }, 'prod')).toThrow();
  });

  it('does not require the runtime key when RUNTIME_KIND=stub', () => {
    expect(() =>
      enforceProdRules('api', { ...ok, RUNTIME_KIND: 'stub', RUNTIME_API_KEY: undefined }, 'prod'),
    ).not.toThrow();
  });

  it('applies no fail-closed rules in local', () => {
    expect(() => enforceProdRules('api', { SUPABASE_JWT_SECRET: DEV_JWT_SECRET }, 'local')).not.toThrow();
  });
});

describe('loadConfig + the JWKS-only-in-prod control', () => {
  const prodEnv: Record<string, string> = {
    APP_ENV: 'prod',
    SUPABASE_URL: 'https://project-ref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    CORS_ORIGINS: 'https://app.example.com',
    RUNTIME_API_KEY: 'runtime-key',
    MCP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000001',
    MCP_WORKSPACE_TOKEN: 'x'.repeat(16),
  };

  it('loads a valid prod config and refuses the dev secret there', () => {
    expect(loadConfig(prodEnv).APP_ENV).toBe('prod');
    expect(() => loadConfig({ ...prodEnv, SUPABASE_JWT_SECRET: DEV_JWT_SECRET })).toThrow();
  });

  it('disables the HS256 secret in prod but keeps it in local', () => {
    expect(buildAppContext(loadConfig(prodEnv)).hsSecret).toBeNull();
    const local = loadConfig({ SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    expect(buildAppContext(local).hsSecret).toBeInstanceOf(Uint8Array);
  });
});

describe('loaders', () => {
  it('loadServerEnv applies defaults for a workload', () => {
    expect(loadServerEnv('worker', { APP_ENV: 'local' }).WORKER_PORT).toBe(8070);
  });

  it('readEnv applies a default, returns parsed values, and throws on a missing required var', () => {
    expect(readEnv('WORKER_PORT', {})).toBe(8070);
    expect(readEnv('SPIKE_MODEL', {})).toBe('claude-sonnet-4-6');
    expect(() => readEnv('SUPABASE_SERVICE_ROLE_KEY', {})).toThrow();
  });
});
