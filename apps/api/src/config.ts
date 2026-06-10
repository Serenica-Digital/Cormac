import { z } from 'zod';

/**
 * Control-plane configuration. The service role key is the one secret that must
 * never leave this process (ADR-003, ADR-005); it is required with no default.
 * Local-friendly defaults are provided for everything that is not a secret.
 */
const envSchema = z.object({
  SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
  /**
   * Expected `iss` claim on user tokens. Defaults to `${SUPABASE_URL}/auth/v1`.
   * Needed when the URL the control plane fetches Supabase at differs from the
   * URL tokens are issued under (e.g. in Docker, where the API reaches Supabase
   * via host.docker.internal but tokens carry the host's 127.0.0.1 issuer).
   */
  SUPABASE_AUTH_ISSUER: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_JWT_SECRET: z
    .string()
    .min(1)
    .default('super-secret-jwt-token-with-at-least-32-characters-long'),
  API_PORT: z.coerce.number().int().positive().default(8088),
  RUNTIME_URL: z.string().url().default('http://127.0.0.1:8090'),
  /**
   * MCP tool surface for the agent runtime (ADR-025). The token is the
   * workspace binding: every tool call authenticated with it is scoped to
   * MCP_WORKSPACE_ID and nothing else. Static pair for the spike (one
   * workspace, one runtime container); per-run minted tokens come later.
   * The /mcp endpoint is disabled unless both are set.
   */
  MCP_WORKSPACE_ID: z.string().uuid().optional(),
  MCP_WORKSPACE_TOKEN: z.string().min(16).optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid control-plane configuration:\n${issues}`);
  }
  return parsed.data;
}
