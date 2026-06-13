import { writeAll } from './lib/env-artifacts.js';

/**
 * Generate `.env.example` and the Helm charts' env/secretEnv from the env
 * manifest (@cormac/config). The manifest is the only place a variable is
 * declared; run this after editing it. `pnpm check:env` enforces that these
 * files match the manifest, so a forgotten regenerate fails CI.
 */

const changed = writeAll();
if (changed.length === 0) {
  console.log('gen:env: already up to date.');
} else {
  console.log(`gen:env: wrote ${changed.length} file(s):`);
  for (const path of changed) console.log(`  - ${path}`);
}
