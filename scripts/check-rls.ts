import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard: every table created in the migrations has RLS enabled. A new
 * table without RLS fails CI, so tenant isolation cannot regress by omission
 * (control-register row 11). Runs without a database.
 */
const dir = 'supabase/migrations';
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

const created = [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) =>
  m[1]!.toLowerCase(),
);
const rlsEnabled = new Set(
  [...sql.matchAll(/alter table public\.(\w+) enable row level security/gi)].map((m) =>
    m[1]!.toLowerCase(),
  ),
);

const missing = created.filter((t) => !rlsEnabled.has(t));
if (missing.length > 0) {
  console.error(`RLS check FAILED. Tables without RLS enabled: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`RLS check: ${created.length} tables, all have row level security enabled.`);
