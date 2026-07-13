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
  // The Hermes runtime (ADR-0001). Optional: the HTTP pipeline and the
  // /agent/* surface work without it; capture and authoring turns answer 503.
  // The two agent kinds run separate gateways (ADR-0016: one pair per
  // workspace); the per-kind URLs let one control plane drive both at once,
  // each falling back to HERMES_URL when only one gateway is in play. One
  // API key serves both locally (both hubs launch from the same vault slot);
  // per-kind keys arrive with the ADR-0016 deployment work if needed.
  HERMES_URL: z.string().url().optional(),
  HERMES_AUTHORING_URL: z.string().url().optional(),
  HERMES_OPS_URL: z.string().url().optional(),
  HERMES_API_KEY: z.string().min(1).optional(),
  // The profile name doubles as the model id on /v1/responses.
  HERMES_MODEL: z.string().min(1).default('cormac-authoring'),
  HERMES_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
});

export type Config = z.infer<typeof configSchema>;

/** The per-kind gateway URL, with HERMES_URL as the single-gateway fallback. */
export function hermesUrlFor(config: Config, kind: 'authoring' | 'operations'): string | undefined {
  return kind === 'authoring'
    ? (config.HERMES_AUTHORING_URL ?? config.HERMES_URL)
    : (config.HERMES_OPS_URL ?? config.HERMES_URL);
}

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
