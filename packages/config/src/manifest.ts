import { z } from 'zod';
import { DEV_JWT_SECRET } from './appEnv.js';

/**
 * The single source of truth for every environment variable in the system
 * (ADR-034). Two halves that a test keeps in lockstep:
 *
 *   - `Z`   : the validation rule (a Zod schema) for each variable, declared once.
 *   - `ENV` : the metadata for each variable (scope, secret, which workloads read
 *             it, whether an operator sets it in .env). This is the only place a
 *             variable is declared. `pnpm gen:env` (scripts/gen-env.ts) generates
 *             `.env.example` and each Helm chart's env/secretEnv from it, and
 *             `pnpm check:env` fails the build if those generated files drift
 *             (ADR-035). Nothing about an env var is born anywhere else.
 *
 * The boot-time loaders (server.ts, browser.ts) and apps/api/src/config.ts all
 * build their schemas from `Z`, so a variable's type and validation live in one
 * place. A `SSE_PROBE_ENABLED`-style drift (read by code, missing from a chart)
 * is now a CI failure, not a silent dead route.
 */

/** A deployable workload (its own image + Juno workload) or a non-deployable consumer. */
export type Workload =
  | 'api'
  | 'worker'
  | 'web'
  | 'pane'
  | 'hermes-runtime'
  | 'runtime-stub'
  | 'scripts';

/** Workloads that ship as images and become Juno workloads; checked against the Helm charts. */
export const DEPLOYABLE_WORKLOADS: Workload[] = ['api', 'worker', 'web', 'pane', 'hermes-runtime'];

/**
 * scope:
 *   - server  : read by one of our Node processes via process.env (api, worker, scripts)
 *   - browser : a VITE_* value read by web/pane via import.meta.env (safe in the bundle)
 *   - runtime : read by the upstream Hermes container itself, not by our loaders;
 *               inventory-only, so the Helm chart wires it but no Node code parses it
 */
export type EnvScope = 'server' | 'browser' | 'runtime';

export interface EnvVar {
  /** Must be a key of `Z`. */
  name: keyof typeof Z;
  scope: EnvScope;
  /** A credential: must never be a literal in source or chart values. */
  secret: boolean;
  /** Which workload containers read this exact env name. */
  workloads: Workload[];
  /** True when an operator sets it in the root .env (and a k8s Secret/values on Juno). */
  inEnvExample: boolean;
  /** Fail-closed in prod-like environments. 'no-dev-default' = present-and-equal-to-dev-default is refused. */
  prod?: 'required' | 'required-if-hermes' | 'no-dev-default';
  description: string;
}

/**
 * Treat an empty-string env value as unset. An empty k8s ConfigMap/Secret value
 * (and an unset `${VAR}` in any shell) resolves to "", so without this an
 * otherwise-optional variable would fail its `min(1)`/`url()` rule. Applied to
 * every optional entry below.
 */
const opt = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

/**
 * The validation rule for every variable, declared once. `apps/api/src/config.ts`,
 * the worker, the scripts, and the browser apps all compose their schemas out of
 * these entries, so a variable's type is defined in exactly one place.
 */
export const Z = {
  // --- meta ---
  APP_ENV: z.enum(['local', 'dev', 'prod']).default('local'),

  // --- Supabase (system of record) ---
  SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
  SUPABASE_AUTH_ISSUER: opt(z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY: opt(z.string().min(1).optional()),
  SUPABASE_JWT_SECRET: z.string().min(1).default(DEV_JWT_SECRET),

  // --- Managed Supabase (remote dev project bootstrap; scripts only) ---
  REMOTE_SUPABASE_URL: opt(z.string().url().optional()),
  REMOTE_SUPABASE_ANON_KEY: opt(z.string().min(1).optional()),
  REMOTE_SUPABASE_SERVICE_ROLE_KEY: opt(z.string().min(1).optional()),
  SUPABASE_DB_URL: opt(z.string().min(1).optional()),
  SUPABASE_DB_PASSWORD: opt(z.string().min(1).optional()),

  // --- Control plane API ---
  API_PORT: z.coerce.number().int().positive().default(8088),
  CORS_ORIGINS: z
    .string()
    .default('http://127.0.0.1:5174,http://localhost:5174,https://localhost:5175,https://127.0.0.1:5175'),

  // --- Agent runtime dispatch (control-plane side) ---
  RUNTIME_KIND: z.enum(['hermes', 'stub']).default('hermes'),
  RUNTIME_URL: z.string().url().default('http://127.0.0.1:8642'),
  RUNTIME_API_KEY: opt(z.string().min(1).optional()),
  RUNTIME_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  RUNTIME_PORT: z.coerce.number().int().positive().default(8090),

  // --- Runtime tool surface (MCP, ADR-025) ---
  MCP_WORKSPACE_ID: opt(z.string().uuid().optional()),
  MCP_WORKSPACE_TOKEN: opt(z.string().min(16).optional()),

  // --- SSE streaming probe (M1 pane spike, Probe A) ---
  SSE_PROBE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => ['true', '1', 'yes', 'on'].includes(v.toLowerCase())),
  SSE_TICK_MS: z.coerce.number().int().positive().default(1000),

  // --- Worker ---
  WORKER_PORT: z.coerce.number().int().positive().default(8070),

  // --- Anthropic + evals ---
  ANTHROPIC_API_KEY: opt(z.string().min(1).optional()),
  SPIKE_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  SPIKE_RUNS: z.coerce.number().int().positive().default(3),
  SPIKE_XLSX: opt(z.string().min(1).optional()),

  // --- Hermes runtime container (the upstream image's own env; inventory-only) ---
  API_SERVER_ENABLED: z.string().default('true'),
  API_SERVER_HOST: z.string().default('0.0.0.0'),
  API_SERVER_PORT: z.coerce.number().int().positive().default(8642),
  API_SERVER_KEY: opt(z.string().min(1).optional()),
  MCP_SERVER_URL: opt(z.string().url().optional()),
  HERMES_ACCEPT_HOOKS: z.string().default('1'),

  // --- Web + Excel pane (Vite, browser) ---
  VITE_API_URL: z.string().url().default('http://127.0.0.1:8088'),
  VITE_SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_ENTRA_CLIENT_ID: opt(z.string().min(1).optional()),
  VITE_ENTRA_AUTHORITY: opt(z.string().url().optional()),
} satisfies Record<string, z.ZodTypeAny>;

export type EnvName = keyof typeof Z;

export const ENV: EnvVar[] = [
  {
    name: 'APP_ENV',
    scope: 'server',
    secret: false,
    workloads: ['api', 'worker', 'scripts'],
    inEnvExample: true,
    description: 'Deployment posture: local | dev | prod. Prod-like turns on fail-closed rules.',
  },
  {
    name: 'SUPABASE_URL',
    scope: 'server',
    secret: false,
    workloads: ['api', 'scripts'],
    inEnvExample: true,
    description: 'System of record base URL.',
  },
  {
    name: 'SUPABASE_AUTH_ISSUER',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    description: 'Expected JWT `iss` when it differs from SUPABASE_URL/auth/v1 (Docker/host split).',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    scope: 'server',
    secret: true,
    workloads: ['api', 'scripts'],
    inEnvExample: true,
    prod: 'required',
    description: 'The RLS-bypassing key. Only the control plane (and bootstrap scripts) holds it.',
  },
  {
    name: 'SUPABASE_ANON_KEY',
    scope: 'server',
    secret: false,
    workloads: ['api', 'scripts'],
    inEnvExample: true,
    description: 'Browser-safe key; supplied to the api for isolation checks and to scripts.',
  },
  {
    name: 'SUPABASE_JWT_SECRET',
    scope: 'server',
    secret: true,
    workloads: ['api'],
    inEnvExample: true,
    prod: 'no-dev-default',
    description: 'HS256 fallback for local only; prod verifies ES256 against the JWKS (ADR-020).',
  },
  {
    name: 'REMOTE_SUPABASE_URL',
    scope: 'server',
    secret: false,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Managed dev project URL for the remote bootstrap. Namespaced so it never collides.',
  },
  {
    name: 'REMOTE_SUPABASE_ANON_KEY',
    scope: 'server',
    secret: false,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Managed dev project anon key (remote bootstrap only).',
  },
  {
    name: 'REMOTE_SUPABASE_SERVICE_ROLE_KEY',
    scope: 'server',
    secret: true,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Managed dev project service-role key (remote bootstrap only).',
  },
  {
    name: 'SUPABASE_DB_URL',
    scope: 'server',
    secret: true,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Direct Postgres URL with embedded password for `db:push:remote`.',
  },
  {
    name: 'SUPABASE_DB_PASSWORD',
    scope: 'server',
    secret: true,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Managed project DB password (remote operations).',
  },
  {
    name: 'API_PORT',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    description: 'Control-plane listen port.',
  },
  {
    name: 'CORS_ORIGINS',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    prod: 'required',
    description: 'Comma-separated CORS allowlist. Must be set explicitly in prod (no localhost default).',
  },
  {
    name: 'RUNTIME_KIND',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    description: 'Runtime dispatch: hermes (product) or stub (tests).',
  },
  {
    name: 'RUNTIME_URL',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    description: 'The Hermes Runs API endpoint.',
  },
  {
    name: 'RUNTIME_API_KEY',
    scope: 'server',
    secret: true,
    workloads: ['api'],
    inEnvExample: true,
    prod: 'required-if-hermes',
    description: 'Bearer key for the Hermes Runs API; the same value becomes API_SERVER_KEY on the runtime.',
  },
  {
    name: 'RUNTIME_TIMEOUT_MS',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    description: "Capture's wait for a terminal run.",
  },
  {
    name: 'MCP_WORKSPACE_ID',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    prod: 'required',
    description: 'The workspace the runtime tool token is bound to.',
  },
  {
    name: 'MCP_WORKSPACE_TOKEN',
    scope: 'server',
    secret: true,
    workloads: ['api', 'hermes-runtime'],
    inEnvExample: true,
    prod: 'required',
    description: 'The runtime tool-surface bearer token; the tenant binding (ADR-025/026).',
  },
  {
    name: 'SSE_PROBE_ENABLED',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    description: 'M1 pane spike SSE probe route on/off. Off unless explicitly enabled.',
  },
  {
    name: 'SSE_TICK_MS',
    scope: 'server',
    secret: false,
    workloads: ['api'],
    inEnvExample: true,
    description: 'SSE progress-frame cadence (wall-clock).',
  },
  {
    name: 'WORKER_PORT',
    scope: 'server',
    secret: false,
    workloads: ['worker'],
    inEnvExample: true,
    description: 'Worker health-endpoint port.',
  },
  {
    name: 'RUNTIME_PORT',
    scope: 'server',
    secret: false,
    workloads: ['runtime-stub'],
    inEnvExample: true,
    description: 'Port for the runtime stub when run directly (test fixture only).',
  },
  {
    name: 'ANTHROPIC_API_KEY',
    scope: 'runtime',
    secret: true,
    workloads: ['hermes-runtime', 'scripts'],
    inEnvExample: true,
    description: 'Model provider key (ADR-013). Used by the Hermes runtime and the workbook eval.',
  },
  {
    name: 'SPIKE_MODEL',
    scope: 'server',
    secret: false,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Override the workbook-contract eval model.',
  },
  {
    name: 'SPIKE_RUNS',
    scope: 'server',
    secret: false,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Override the workbook-contract eval run count.',
  },
  {
    name: 'SPIKE_XLSX',
    scope: 'server',
    secret: false,
    workloads: ['scripts'],
    inEnvExample: true,
    description: 'Path to a real workbook for the explore eval (synthetic/local only).',
  },
  {
    name: 'API_SERVER_ENABLED',
    scope: 'runtime',
    secret: false,
    workloads: ['hermes-runtime'],
    inEnvExample: false,
    description: 'Hermes headless Runs API on. Wired by the Helm chart, not a root .env value.',
  },
  {
    name: 'API_SERVER_HOST',
    scope: 'runtime',
    secret: false,
    workloads: ['hermes-runtime'],
    inEnvExample: false,
    description: 'Hermes Runs API bind host. Wired by the Helm chart.',
  },
  {
    name: 'API_SERVER_PORT',
    scope: 'runtime',
    secret: false,
    workloads: ['hermes-runtime'],
    inEnvExample: false,
    description: 'Hermes Runs API port. Wired by the Helm chart.',
  },
  {
    name: 'API_SERVER_KEY',
    scope: 'runtime',
    secret: true,
    workloads: ['hermes-runtime'],
    inEnvExample: false,
    description: 'Hermes Runs API bearer key; the same value as the api RUNTIME_API_KEY.',
  },
  {
    name: 'MCP_SERVER_URL',
    scope: 'runtime',
    secret: false,
    workloads: ['hermes-runtime'],
    inEnvExample: false,
    description: 'Control-plane /mcp URL interpolated into the Hermes config. Wired by the Helm chart.',
  },
  {
    name: 'HERMES_ACCEPT_HOOKS',
    scope: 'runtime',
    secret: false,
    workloads: ['hermes-runtime'],
    inEnvExample: false,
    description: "Accept the profile's pre_tool_call deny hook headlessly.",
  },
  {
    name: 'VITE_API_URL',
    scope: 'browser',
    secret: false,
    workloads: ['web', 'pane'],
    inEnvExample: true,
    description: 'Control-plane endpoint for the browser apps.',
  },
  {
    name: 'VITE_SUPABASE_URL',
    scope: 'browser',
    secret: false,
    workloads: ['web', 'pane'],
    inEnvExample: true,
    description: 'Supabase URL for the browser auth client.',
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    scope: 'browser',
    secret: false,
    workloads: ['web', 'pane'],
    inEnvExample: true,
    description: 'Browser anon key; safe in the bundle because RLS bounds its reach.',
  },
  {
    name: 'VITE_ENTRA_CLIENT_ID',
    scope: 'browser',
    secret: false,
    workloads: ['pane'],
    inEnvExample: true,
    description: 'Excel pane Entra sign-in (Lanes A/B). Optional; unset runs Lane 0.',
  },
  {
    name: 'VITE_ENTRA_AUTHORITY',
    scope: 'browser',
    secret: false,
    workloads: ['pane'],
    inEnvExample: true,
    description: 'Entra authority URL for the pane sign-in lanes.',
  },
];

const BY_NAME = new Map<EnvName, EnvVar>(ENV.map((e) => [e.name, e]));

export function envVar(name: EnvName): EnvVar {
  const e = BY_NAME.get(name);
  if (!e) throw new Error(`No ENV metadata for ${name}`);
  return e;
}

/** Env names a given workload's container reads (the Helm chart must surface these). */
export function namesForWorkload(workload: Workload): EnvName[] {
  return ENV.filter((e) => e.workloads.includes(workload)).map((e) => e.name);
}

/** Build a Zod object schema from the entries matching a predicate. */
export function schemaFor(predicate: (e: EnvVar) => boolean): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const e of ENV) {
    if (predicate(e)) shape[e.name] = Z[e.name];
  }
  return z.object(shape);
}
