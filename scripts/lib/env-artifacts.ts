import { readFileSync, writeFileSync } from 'node:fs';
import { parseDocument, isMap, isSeq, isScalar, type YAMLMap, type YAMLSeq } from 'yaml';
import {
  DEPLOYABLE_WORKLOADS,
  ENV,
  Z,
  envVar,
  type EnvName,
  type Workload,
} from '@cormac/config';

/**
 * The env-artifact generator (ADR-034 -> ADR-035). The env manifest
 * (@cormac/config) is the single place a variable is DECLARED; this module
 * generates the two artifacts that used to be hand-maintained beside it:
 *
 *   - `.env.example`              : fully generated. Every value is a manifest
 *                                   default (the Z schema) or an intentionally
 *                                   blank operator slot, so it round-trips.
 *   - each chart's env/secretEnv  : reconciled surgically. The generator owns
 *                                   only which keys appear and their env-vs-secret
 *                                   classification; it never writes environment
 *                                   values and never touches image/ingress/
 *                                   resources/recycle/viteBuildArgs. When a chart
 *                                   already matches the manifest it is returned
 *                                   byte-for-byte unchanged (no reformat churn).
 *
 * `pnpm gen:env` writes; `pnpm check:env` regenerates in memory and fails the
 * build if the tree disagrees. Rendering policy (sections, emit mode, operator
 * hints) lives here, not in the manifest: the manifest declares variables; this
 * file decides how the example reads. A variable with no section override still
 * renders (in "Other"), so adding one to the manifest is never silently dropped.
 */

export const CHART_WORKLOADS: Workload[] = DEPLOYABLE_WORKLOADS;
export const ENV_EXAMPLE_PATH = '.env.example';
export const chartValuesPath = (workload: Workload): string => `deploy/helm/${workload}/values.yaml`;

// --- .env.example rendering policy -------------------------------------------

/** Section order + membership for the generated `.env.example`. */
const SECTIONS: { title: string; vars: EnvName[] }[] = [
  { title: 'Deployment posture', vars: ['APP_ENV'] },
  {
    title: 'Supabase (system of record)',
    vars: ['SUPABASE_URL', 'SUPABASE_AUTH_ISSUER', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_JWT_SECRET'],
  },
  {
    title: 'Managed Supabase (remote dev project, ADR-017)',
    vars: ['REMOTE_SUPABASE_URL', 'REMOTE_SUPABASE_ANON_KEY', 'REMOTE_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD'],
  },
  { title: 'Control plane API', vars: ['API_PORT', 'CORS_ORIGINS'] },
  { title: 'Agent runtime (Hermes)', vars: ['RUNTIME_KIND', 'RUNTIME_URL', 'RUNTIME_API_KEY', 'RUNTIME_TIMEOUT_MS', 'RUNTIME_PORT'] },
  { title: 'Runtime tool surface (MCP, ADR-025)', vars: ['MCP_WORKSPACE_ID', 'MCP_WORKSPACE_TOKEN'] },
  { title: 'SSE streaming probe (M1 pane spike, Probe A)', vars: ['SSE_PROBE_ENABLED', 'SSE_TICK_MS'] },
  { title: 'Worker', vars: ['WORKER_PORT'] },
  { title: 'Anthropic API + evals', vars: ['ANTHROPIC_API_KEY', 'SPIKE_MODEL', 'SPIKE_RUNS', 'SPIKE_XLSX'] },
  {
    title: 'Web + Excel pane (Vite, browser)',
    vars: ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_ENTRA_CLIENT_ID', 'VITE_ENTRA_AUTHORITY'],
  },
];

type EmitMode = 'default' | 'blank' | 'commented';

/** Emit-mode overrides where the computed default (secret -> blank, has-default -> default) is wrong. */
const MODE: Partial<Record<EnvName, EmitMode>> = {
  SUPABASE_JWT_SECRET: 'default', // secret, but the public dev value is shown (ADR-020/034)
  SUPABASE_AUTH_ISSUER: 'commented',
  REMOTE_SUPABASE_URL: 'commented',
  REMOTE_SUPABASE_ANON_KEY: 'commented',
  REMOTE_SUPABASE_SERVICE_ROLE_KEY: 'commented',
  SUPABASE_DB_URL: 'commented',
  SUPABASE_DB_PASSWORD: 'commented',
  CORS_ORIGINS: 'commented',
  RUNTIME_TIMEOUT_MS: 'commented',
  MCP_WORKSPACE_ID: 'default', // no Z default; the seeded demo id is shown via SHOWN_VALUE
  SSE_PROBE_ENABLED: 'commented',
  SSE_TICK_MS: 'commented',
  WORKER_PORT: 'commented',
  SPIKE_MODEL: 'commented',
  SPIKE_RUNS: 'commented',
  SPIKE_XLSX: 'commented',
  VITE_ENTRA_CLIENT_ID: 'commented',
  VITE_ENTRA_AUTHORITY: 'commented',
};

/** The example value shown when it is not the Z default (a demo id, a shaped placeholder). */
const SHOWN_VALUE: Partial<Record<EnvName, string>> = {
  MCP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000001',
  SUPABASE_AUTH_ISSUER: 'http://127.0.0.1:54321/auth/v1',
  REMOTE_SUPABASE_URL: 'https://<project-ref>.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres:...@db.<project-ref>.supabase.co:5432/postgres',
  SSE_PROBE_ENABLED: 'true',
  VITE_ENTRA_AUTHORITY: 'https://login.microsoftonline.com/common',
};

/** Extra operator guidance appended to the description as a comment line. */
const HINT: Partial<Record<EnvName, string>> = {
  SUPABASE_SERVICE_ROLE_KEY: 'Local value: the SERVICE_ROLE_KEY line from `pnpm db:start` (or `pnpm exec supabase status -o env`). Never ship it to the browser or the runtime.',
  SUPABASE_ANON_KEY: 'Local value: the ANON_KEY line from the same output.',
  RUNTIME_API_KEY: 'Generate one: openssl rand -hex 24.',
  MCP_WORKSPACE_TOKEN: 'Generate one: openssl rand -hex 24.',
  ANTHROPIC_API_KEY: 'From console.anthropic.com -> API keys. Synthetic data only.',
};

/** Extract the default a Zod schema applies, unwrapping preprocess/optional wrappers. */
export function zDefault(name: EnvName): string | undefined {
  let schema: unknown = Z[name];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (let s = schema as any; s && s._def; s = schema as any) {
    const t = s._def.typeName as string;
    if (t === 'ZodDefault') return String(s._def.defaultValue());
    if (t === 'ZodEffects') {
      schema = s._def.schema;
      continue;
    }
    if (t === 'ZodOptional' || t === 'ZodNullable') {
      schema = s._def.innerType;
      continue;
    }
    break;
  }
  return undefined;
}

function emitMode(name: EnvName): EmitMode {
  const override = MODE[name];
  if (override) return override;
  if (envVar(name).secret) return 'blank';
  return zDefault(name) !== undefined ? 'default' : 'blank';
}

function shownValue(name: EnvName): string {
  return SHOWN_VALUE[name] ?? zDefault(name) ?? '';
}

function commentLines(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (cur && cur.length + 1 + word.length > 74) {
      out.push(`# ${cur}`);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) out.push(`# ${cur}`);
  return out;
}

function renderVar(name: EnvName): string[] {
  const meta = envVar(name);
  const lines: string[] = [...commentLines(meta.description)];
  const hint = HINT[name];
  if (hint) lines.push(...commentLines(hint));
  const mode = emitMode(name);
  if (mode === 'blank') lines.push(`${name}=`);
  else if (mode === 'default') lines.push(`${name}=${shownValue(name)}`);
  else lines.push(`# ${name}=${shownValue(name)}`);
  return lines;
}

/** The full generated `.env.example`, deterministic and dependency-free. */
export function renderEnvExample(): string {
  const placed = new Set<EnvName>();
  const blocks: string[] = [];

  const header = [
    '# Reference list of every variable, GENERATED by `pnpm gen:env` from the env',
    '# manifest (@cormac/config). Edit the manifest, not this file; `pnpm check:env`',
    '# fails the build if they drift. Documentation only: secret VALUES live in',
    '# Infisical and inject via `infisical run` (ADR-035). You do not need a .env file.',
    '# Local Supabase values are printed by `pnpm db:start`.',
  ].join('\n');

  const renderSection = (title: string, names: EnvName[]): void => {
    const rendered = names
      .filter((n) => envVar(n).inEnvExample)
      .map((n) => {
        placed.add(n);
        return renderVar(n).join('\n');
      });
    if (rendered.length === 0) return;
    blocks.push(`# --- ${title} ---\n${rendered.join('\n')}`);
  };

  for (const section of SECTIONS) renderSection(section.title, section.vars);

  // Anything inEnvExample the section policy forgot still renders, never dropped.
  const orphans = ENV.filter((e) => e.inEnvExample && !placed.has(e.name)).map((e) => e.name);
  if (orphans.length > 0) renderSection('Other', orphans);

  return `${header}\n\n${blocks.join('\n\n')}\n`;
}

// --- Helm chart env/secretEnv reconcile --------------------------------------

/** The env (non-secret) and secret keys a workload's chart must surface, in manifest order. */
export function classify(workload: Workload): { env: EnvName[]; secret: EnvName[] } {
  const names = ENV.filter(
    (e) => e.workloads.includes(workload) && (e.scope === 'server' || e.scope === 'runtime'),
  ).map((e) => e.name);
  return {
    env: names.filter((n) => !envVar(n).secret),
    secret: names.filter((n) => envVar(n).secret),
  };
}

function envKeysOf(envNode: unknown): string[] {
  return isMap(envNode) ? envNode.items.map((it) => String((it.key as { value?: unknown }).value ?? it.key)) : [];
}

function secretKeysOf(seqNode: unknown): string[] {
  return isSeq(seqNode) ? seqNode.items.map((it) => (isScalar(it) ? String(it.value) : String(it))) : [];
}

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && new Set([...a, ...b]).size === a.length;

/**
 * Reconcile a chart's `env` map and `secretEnv` list against the manifest,
 * preserving every value, comment, and unrelated key. Returns the input text
 * unchanged when the membership and classification already match (the common
 * case), so an in-sync chart never churns through the YAML serializer.
 */
export function reconcileChartValues(workload: Workload, text: string): string {
  const want = classify(workload);
  const doc = parseDocument(text);
  const curEnv = envKeysOf(doc.get('env'));
  const curSecret = secretKeysOf(doc.get('secretEnv'));
  if (sameSet(curEnv, want.env) && sameSet(curSecret, want.secret)) return text;

  const envNode = doc.get('env') as YAMLMap | null;
  if (isMap(envNode)) {
    for (const key of curEnv) if (!want.env.includes(key as EnvName)) envNode.delete(key);
    for (const name of want.env) {
      if (!envNode.has(name)) {
        envNode.set(name, 'SET ME');
        const pair = envNode.items.find((p) => String((p.key as { value?: unknown }).value ?? p.key) === name);
        if (pair && isScalar(pair.value)) pair.value.comment = ' SET ME -- generated key; fill the value per environment';
      }
    }
  }

  const secNode = doc.get('secretEnv') as YAMLSeq | null;
  if (isSeq(secNode)) {
    for (let i = secNode.items.length - 1; i >= 0; i -= 1) {
      const v = isScalar(secNode.items[i]) ? String((secNode.items[i] as { value: unknown }).value) : String(secNode.items[i]);
      if (!want.secret.includes(v as EnvName)) secNode.delete(i);
    }
    const present = secretKeysOf(secNode);
    for (const name of want.secret) if (!present.includes(name)) secNode.add(name);
  }

  return doc.toString();
}

// --- fs orchestration (used by gen-env.ts and check-env.ts) ------------------

const readText = (path: string): string => readFileSync(path, 'utf8');

/** Write the generated artifacts, returning the paths that actually changed. */
export function writeAll(): string[] {
  const changed: string[] = [];

  const envText = renderEnvExample();
  if (readText(ENV_EXAMPLE_PATH) !== envText) {
    writeFileSync(ENV_EXAMPLE_PATH, envText);
    changed.push(ENV_EXAMPLE_PATH);
  }
  for (const workload of CHART_WORKLOADS) {
    const path = chartValuesPath(workload);
    const cur = readText(path);
    const next = reconcileChartValues(workload, cur);
    if (next !== cur) {
      writeFileSync(path, next);
      changed.push(path);
    }
  }
  return changed;
}

/** Regenerate in memory and report any artifact that disagrees with the manifest. */
export function checkAll(): { path: string; reason: string }[] {
  const problems: { path: string; reason: string }[] = [];

  if (readText(ENV_EXAMPLE_PATH) !== renderEnvExample()) {
    problems.push({ path: ENV_EXAMPLE_PATH, reason: 'out of sync with the manifest' });
  }
  for (const workload of CHART_WORKLOADS) {
    const path = chartValuesPath(workload);
    const cur = readText(path);
    if (reconcileChartValues(workload, cur) !== cur) {
      problems.push({ path, reason: 'env/secretEnv out of sync with the manifest' });
    }
  }
  return problems;
}
