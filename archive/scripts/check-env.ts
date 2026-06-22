import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ENV } from '@cormac/config';
import { CHART_WORKLOADS, chartValuesPath, checkAll } from './lib/env-artifacts.js';

/**
 * The env-contract guard (ADR-034 -> ADR-035, control-register row 12). The env
 * manifest (@cormac/config) is the only place a variable is declared;
 * `.env.example` and each chart's env/secretEnv are generated from it by
 * `pnpm gen:env`. This guard regenerates them in memory and fails the build if
 * the committed files disagree, so a forgotten `gen:env` is a CI failure (the
 * lockfile pattern). It runs without a database. Two checks:
 *
 *   1. The generated artifacts (`.env.example`, the five charts' env/secretEnv)
 *      match the manifest; otherwise: run `pnpm gen:env`.
 *   2. Belt-and-suspenders: no secret-classified variable appears as a literal
 *      in a chart's `env` ConfigMap (secrets must ride secretEnv -> secretKeyRef).
 *
 * Compose is gone (ADR-035): Helm is the only orchestrator, so there is no
 * compose block left to drift.
 */

const problems: string[] = [];

// --- 1. generated artifacts match the manifest -------------------------------
for (const { path, reason } of checkAll()) {
  problems.push(`${path}: ${reason} -- run \`pnpm gen:env\``);
}

// --- 2. no secret is a literal in a chart ConfigMap --------------------------
const secretNames = new Set(ENV.filter((e) => e.secret).map((e) => e.name as string));
for (const workload of CHART_WORKLOADS) {
  const values = (parse(readFileSync(chartValuesPath(workload), 'utf8')) ?? {}) as {
    env?: Record<string, unknown>;
  };
  for (const key of Object.keys(values.env ?? {})) {
    if (secretNames.has(key)) {
      problems.push(`helm[${workload}]: secret ${key} is a literal in env; it must ride secretEnv`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Env-contract check FAILED:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Env-contract check: clean (${ENV.length} variables, ${CHART_WORKLOADS.length} charts).`);
