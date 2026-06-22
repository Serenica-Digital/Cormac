import { z } from 'zod';
import { Z } from '@cormac/config';
import { enforceProdRules } from '@cormac/config/server';

/**
 * Control-plane configuration. The variable rules live once in the shared
 * manifest (`@cormac/config`, ADR-034); this schema picks the api's slice of them
 * so `Config` stays strongly typed and the routes keep their types. A unit test
 * binds these keys to the manifest, and `scripts/check-env.ts` keeps compose and
 * Helm in step, so the four declaration sites can no longer drift.
 *
 * The service role key is the one secret that must never leave this process
 * (ADR-003, ADR-005); it is required with no default. The prod-only fail-closed
 * rules (no public JWT secret, required runtime/MCP credentials, explicit CORS)
 * are enforced by `enforceProdRules` after the parse.
 */
const apiSchema = z.object({
  APP_ENV: Z.APP_ENV,
  SUPABASE_URL: Z.SUPABASE_URL,
  SUPABASE_AUTH_ISSUER: Z.SUPABASE_AUTH_ISSUER,
  SUPABASE_SERVICE_ROLE_KEY: Z.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: Z.SUPABASE_ANON_KEY,
  SUPABASE_JWT_SECRET: Z.SUPABASE_JWT_SECRET,
  API_PORT: Z.API_PORT,
  CORS_ORIGINS: Z.CORS_ORIGINS,
  RUNTIME_KIND: Z.RUNTIME_KIND,
  RUNTIME_URL: Z.RUNTIME_URL,
  RUNTIME_API_KEY: Z.RUNTIME_API_KEY,
  RUNTIME_TIMEOUT_MS: Z.RUNTIME_TIMEOUT_MS,
  MCP_WORKSPACE_ID: Z.MCP_WORKSPACE_ID,
  MCP_WORKSPACE_TOKEN: Z.MCP_WORKSPACE_TOKEN,
  SSE_PROBE_ENABLED: Z.SSE_PROBE_ENABLED,
  SSE_TICK_MS: Z.SSE_TICK_MS,
});

/** The api's env keys, exported so a unit test can bind them to the manifest. */
export const API_ENV_KEYS = Object.keys(apiSchema.shape);

export type Config = z.infer<typeof apiSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = apiSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid control-plane configuration:\n${issues}`);
  }
  enforceProdRules('api', env, parsed.data.APP_ENV);
  return parsed.data;
}
