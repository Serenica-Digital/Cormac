import { mkdirSync, writeFileSync } from 'node:fs';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { assertLocalDemoTarget, runDemoSeed } from './lib/demo-seed.js';

/**
 * Seed (or re-seed) the fixed demo personas and workspaces against the LOCAL
 * stack. Idempotent: safe to run whenever; existing workspaces are reused and
 * persona passwords are re-set. See docs/dev/demo-accounts.md.
 *
 * Usage: pnpm seed:demo [--reset] [--no-tokens]
 *   --reset      purge both demo workspaces and rebuild them (auth users kept)
 *   --no-tokens  skip rebinding the dev vault agent tokens
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (via `infisical run`).
 */

try {
  assertLocalDemoTarget();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const bindTokens = !args.includes('--no-tokens');
const unknown = args.filter((a) => a !== '--reset' && a !== '--no-tokens');
if (unknown.length > 0) {
  console.error(`unknown argument(s): ${unknown.join(' ')} (expected --reset / --no-tokens)`);
  process.exit(2);
}

const db = createServiceClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const result = await runDemoSeed(db, { reset, bindTokens });

const manifest = { ...result, seededAt: new Date().toISOString() };
const outDir = new URL('../.jarvis/tmp/notes/demo/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + 'seed.json', JSON.stringify(manifest, null, 2));

console.log(
  JSON.stringify(
    {
      workspaces: manifest.workspaces,
      personas: manifest.personas.map((p) => `${p.email} (${p.memberships.map((m) => m.role).join(', ') || 'platform operator'})`),
      password: manifest.password,
      tokens: manifest.tokens
        ? {
            authoringMinted: manifest.tokens.authoring.minted,
            operationsMinted: manifest.tokens.operations.minted,
            note: 'demo now holds the live token bindings; reseed an e2e workspace to move them back',
          }
        : 'skipped',
      manifest: '.jarvis/tmp/notes/demo/seed.json',
    },
    null,
    2,
  ),
);
