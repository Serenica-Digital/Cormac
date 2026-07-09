import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // '@/' is apps/web's internal alias; no other package uses it, so mapping
    // it globally here keeps root-run vitest resolving the web tests.
    alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'archive/**'],
    // Integration tests do real round-trips to local Supabase.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
