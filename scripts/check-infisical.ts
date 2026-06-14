import { execFileSync } from 'node:child_process';
import { ENV } from '@cormac/config';
import { zDefault } from './lib/env-artifacts.js';

/**
 * Completeness guard for the secret authority (ADR-035, control-register row 12).
 * Infisical holds the secret VALUES; the manifest (@cormac/config) declares which
 * variables are secret. This proves the Infisical `dev` environment actually
 * contains every secret the app needs to boot, so a secret added to the manifest
 * but never pushed to Infisical is a caught failure here, not a broken deploy.
 *
 * Required set: every operator-supplied secret (in `.env.example`) with no safe
 * in-repo default, a genuine credential that MUST be supplied. Out of scope:
 * defaulted values (e.g. the public dev JWT secret) and chart-derived runtime
 * secrets like API_SERVER_KEY (the chart sets it to RUNTIME_API_KEY's value).
 *
 * Auth: uses the Infisical CLI session (`infisical login`) locally, or an
 * INFISICAL_TOKEN machine-identity token in CI. The project is read from
 * `.infisical.json`. If the CLI is not installed the guard soft-skips (it is
 * opt-in until the machine identity is wired); any other failure is hard.
 */

// The managed-Supabase bootstrap namespace (REMOTE_*, SUPABASE_DB_*) is part of
// the gated prod-posture work (ADR-035 open item 1). The proven local posture
// does not need it and the `dev` environment holds local values today, so it is
// not enforced here yet. Remove this exclusion when the managed posture is proven.
const isGatedManaged = (name: string): boolean =>
  name.startsWith('REMOTE_') || name === 'SUPABASE_DB_URL' || name === 'SUPABASE_DB_PASSWORD';

const required = ENV.filter(
  (e) => e.secret && e.inEnvExample && zDefault(e.name) === undefined && !isGatedManaged(e.name),
).map((e) => e.name);

let have: Set<string>;
try {
  // `infisical export --format=json` returns an array of secret objects: [{ key, value, ... }].
  const json = execFileSync('infisical', ['export', '--format=json'], { encoding: 'utf8' });
  const rows = JSON.parse(json) as Array<{ key?: string }>;
  have = new Set(rows.map((r) => r.key).filter((k): k is string => Boolean(k)));
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === 'ENOENT') {
    console.log('check:infisical: Infisical CLI not installed; skipping (opt-in guard).');
    process.exit(0);
  }
  console.error(`check:infisical FAILED: could not read the Infisical 'dev' environment: ${e.message}`);
  console.error('Run `infisical login` (local) or set a valid INFISICAL_TOKEN (CI machine identity).');
  process.exit(1);
}

const missing = required.filter((name) => !have.has(name as string));
if (missing.length > 0) {
  console.error(
    `check:infisical FAILED: Infisical 'dev' is missing required secrets:\n${missing
      .map((m) => `  - ${m}`)
      .join('\n')}`,
  );
  console.error('Push each with `infisical secrets set <NAME>=<value> --env=dev`.');
  process.exit(1);
}
console.log(`check:infisical: clean (${required.length} required secrets present in Infisical 'dev').`);
