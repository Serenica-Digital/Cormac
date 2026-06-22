import { execFileSync } from 'node:child_process';

/**
 * Detect silent migration drift between supabase/migrations and the running
 * local database. `pnpm db:start` reuses an existing container and never
 * re-applies new migrations, so a developer can pass tests locally against an
 * outdated schema and fail in CI (which always starts fresh). This makes the
 * drift loud instead.
 *
 * Wraps `supabase migration list --local`: the Local column is the migration
 * files, the Remote column is what the local database has applied.
 */
let output: string;
try {
  output = execFileSync('pnpm', ['exec', 'supabase', 'migration', 'list', '--local'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  console.error('check:migrations: could not reach the local database. Is it up? (pnpm db:start)');
  console.error(String(err));
  process.exit(1);
}

const unapplied: string[] = [];
const unknown: string[] = [];

for (const line of output.split('\n')) {
  const m = /^\s*(\S*)\s*\|\s*(\S*)\s*\|/.exec(line);
  if (!m) continue;
  const [, local, remote] = m;
  if (local === 'Local' || /^-+$/.test(local ?? '')) continue;
  if (local && !remote) unapplied.push(local);
  if (!local && remote) unknown.push(remote);
}

if (unapplied.length || unknown.length) {
  if (unapplied.length) {
    console.error(
      `Migration drift: ${unapplied.join(', ')} exist in supabase/migrations but are NOT applied to the local database.`,
    );
  }
  if (unknown.length) {
    console.error(
      `Migration drift: the local database has ${unknown.join(', ')} with no matching file (branch switch?).`,
    );
  }
  console.error('Fix: pnpm db:reset (re-applies all migrations to a fresh local database).');
  process.exit(1);
}
console.log('Migrations: local database matches supabase/migrations.');
