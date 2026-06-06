import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The cross-tenant integration test does real round-trips to local Supabase.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
