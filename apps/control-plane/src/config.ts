import { z } from 'zod';

/**
 * Control-plane configuration, inlined (v0's shared config manifest is not
 * ported; one app does not need the machinery). Values come from the process
 * env, injected by `infisical run` in development and by the deployment later;
 * there is no dotenv anywhere.
 *
 * The service role key is the one secret that must never leave this process;
 * it is required with no default. In prod-like environments the HS256 dev
 * fallback is disabled at the app-context layer (hsSecret = null).
 */
const configSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_AUTH_ISSUER: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  API_PORT: z.coerce.number().int().positive().default(8080),
  CORS_ORIGINS: z.string().default(''),
  // The Hermes runtime lanes (ADR-0001): one gateway process per agent kind
  // (ADR-0005/0008), so one URL per lane. Each is optional: an unset lane
  // answers 503 on its feature (authoring turns / capture) and the rest of
  // the surface works. One API key serves both gateways by convention.
  HERMES_AUTHORING_URL: z.string().url().optional(),
  HERMES_OPS_URL: z.string().url().optional(),
  HERMES_API_KEY: z.string().min(1).optional(),
  HERMES_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
});

export type Config = z.infer<typeof configSchema>;

export function isProdLike(env: Config['APP_ENV']): boolean {
  return env === 'staging' || env === 'production';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid control-plane configuration:\n${issues}`);
  }
  if (!isProdLike(parsed.data.APP_ENV) && !parsed.data.SUPABASE_JWT_SECRET) {
    throw new Error(
      'SUPABASE_JWT_SECRET is required outside prod-like environments (the HS256 dev path)',
    );
  }
  return parsed.data;
}
