import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // '@/' is apps/web's internal alias; no other package uses it, so mapping
    // it globally here keeps root-run vitest resolving the web tests. The
    // @cormac/* aliases cover imports from scripts/, which is not a workspace
    // package and has no node_modules link of its own.
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      '@cormac/authz': fileURLToPath(new URL('./packages/authz/src/index.ts', import.meta.url)),
      '@cormac/contract': fileURLToPath(new URL('./packages/contract/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'archive/**'],
    // Integration tests do real round-trips to local Supabase.
    testTimeout: 30000,
    hookTimeout: 30000,
    // One file at a time: the integration suites all hammer the same local
    // Supabase gateway, and parallel files made it answer "invalid response
    // was received from the upstream server" intermittently as the suite grew.
    fileParallelism: false,
  },
});
