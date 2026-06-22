import { z } from 'zod';
import { Z } from './manifest.js';

/**
 * The VITE_* contract for the browser apps (web + pane). Composed from the shared
 * `Z` rules so a value's validation lives in one place; a test binds these keys to
 * the `browser`-scope manifest entries. No Node imports, so Vite bundles it safely.
 * The caller passes `import.meta.env`, so that Vite-only token stays in app code.
 */
export const browserEnvSchema = z.object({
  VITE_API_URL: Z.VITE_API_URL,
  VITE_SUPABASE_URL: Z.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: Z.VITE_SUPABASE_ANON_KEY,
  VITE_ENTRA_CLIENT_ID: Z.VITE_ENTRA_CLIENT_ID,
  VITE_ENTRA_AUTHORITY: Z.VITE_ENTRA_AUTHORITY,
});

export type BrowserEnv = z.infer<typeof browserEnvSchema>;

/** Validate the browser env at module load so a misconfigured bundle fails fast and loud.
 *  Accepts `Record<string, unknown>` so callers can pass `import.meta.env` directly. */
export function loadBrowserEnv(env: Record<string, unknown>): BrowserEnv {
  const parsed = browserEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid browser (VITE_*) configuration:\n${issues}`);
  }
  return parsed.data;
}
