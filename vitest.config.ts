import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'archive/**'],
    // Integration tests do real round-trips to local Supabase.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
