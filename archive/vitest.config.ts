import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Valid-shaped VITE_* so the fail-closed browser-env validator
    // (packages/config/src/browser.ts) passes when apps/pane|web unit tests
    // transitively import their env.ts. Test-only, no real values, no .env.
    env: {
      VITE_API_URL: 'http://localhost:8088',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    // The cross-tenant integration test does real round-trips to local Supabase.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
