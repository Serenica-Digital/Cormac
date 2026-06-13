import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  DEPLOYABLE_WORKLOADS,
  ENV,
  envVar,
  namesForWorkload,
  type EnvName,
  type Workload,
} from '@cormac/config';

/**
 * The env-contract guard (ADR-034, control-register row 12). It proves the single
 * manifest (@cormac/config) and the three places environment is wired stay in
 * lockstep, so the four-way drift that killed SSE_PROBE_ENABLED in Docker is a CI
 * failure, not a silent dead route. Runs without a database. Three checks:
 *
 *   1. .env.example documents exactly the operator-set (inEnvExample) variables.
 *   2. Each deployable workload's docker/compose.yaml `environment:` block passes
 *      through exactly the variables that workload reads, and every secret is a
 *      `${...}` interpolation, never a literal.
 *   3. Each workload's Helm chart surfaces its runtime (server/runtime-scope)
 *      variables: secrets in `secretEnv` (a k8s Secret), the rest in `env` (a
 *      ConfigMap), classified exactly as the manifest says. Browser (VITE_*)
 *      values are baked at build time, so they are not runtime env and are not
 *      checked against the charts.
 */

const problems: string[] = [];

function diff(required: string[], actual: string[]): { missing: string[]; extra: string[] } {
  const a = new Set(actual);
  const r = new Set(required);
  return {
    missing: required.filter((x) => !a.has(x)),
    extra: actual.filter((x) => !r.has(x)),
  };
}

const metaOf = (name: string): (typeof ENV)[number] | undefined => ENV.find((e) => e.name === name);

// --- 1. .env.example ---------------------------------------------------------
{
  const text = readFileSync('.env.example', 'utf8');
  const documented = new Set<string>();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (m) documented.add(m[1]!);
  }
  const expected = ENV.filter((e) => e.inEnvExample).map((e) => e.name as string);
  const { missing, extra } = diff(expected, [...documented]);
  for (const k of missing) problems.push(`.env.example: missing ${k} (manifest marks it inEnvExample)`);
  for (const k of extra) problems.push(`.env.example: documents ${k}, which is not an inEnvExample manifest variable`);
}

// --- 2. docker/compose.yaml --------------------------------------------------
const COMPOSE_SERVICE: Record<string, Workload> = {
  api: 'api',
  worker: 'worker',
  web: 'web',
  pane: 'pane',
  hermes: 'hermes-runtime',
};
{
  const compose = parse(readFileSync('docker/compose.yaml', 'utf8')) as {
    services?: Record<string, { environment?: Record<string, unknown> }>;
  };
  for (const [service, workload] of Object.entries(COMPOSE_SERVICE)) {
    const def = compose.services?.[service];
    if (!def) {
      problems.push(`compose: service "${service}" is missing`);
      continue;
    }
    const block = def.environment ?? {};
    const actual = Object.keys(block);
    const required = namesForWorkload(workload) as string[];
    const { missing, extra } = diff(required, actual);
    for (const k of missing) {
      problems.push(`compose[${service}]: missing env ${k} (workload ${workload} reads it)`);
    }
    for (const k of extra) problems.push(`compose[${service}]: env ${k} is not in the manifest for ${workload}`);
    for (const k of actual) {
      if (metaOf(k)?.secret && !String(block[k] ?? '').includes('${')) {
        problems.push(`compose[${service}]: secret ${k} has a literal value; use \${${k}} interpolation`);
      }
    }
  }
}

// --- 3. Helm charts ----------------------------------------------------------
{
  const runtimeScoped = (name: EnvName): boolean => {
    const s = envVar(name).scope;
    return s === 'server' || s === 'runtime';
  };
  for (const workload of DEPLOYABLE_WORKLOADS) {
    const valuesPath = `deploy/helm/${workload}/values.yaml`;
    if (!existsSync(valuesPath)) {
      problems.push(`helm: missing ${valuesPath}`);
      continue;
    }
    const values = (parse(readFileSync(valuesPath, 'utf8')) ?? {}) as {
      env?: Record<string, unknown>;
      secretEnv?: string[];
    };
    const envKeys = Object.keys(values.env ?? {});
    const secretKeys = values.secretEnv ?? [];
    const required = namesForWorkload(workload).filter(runtimeScoped) as string[];
    const { missing, extra } = diff(required, [...envKeys, ...secretKeys]);
    for (const k of missing) problems.push(`helm[${workload}]: values surface no ${k}`);
    for (const k of extra) problems.push(`helm[${workload}]: values declare ${k}, not in the manifest for this workload`);
    for (const k of envKeys) {
      if (metaOf(k)?.secret) problems.push(`helm[${workload}]: ${k} is a secret; move it to secretEnv`);
    }
    for (const k of secretKeys) {
      const meta = metaOf(k);
      if (meta && !meta.secret) problems.push(`helm[${workload}]: ${k} is not a secret; move it to env`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Env-contract check FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Env-contract check: clean (${ENV.length} variables, ${DEPLOYABLE_WORKLOADS.length} workloads).`);
