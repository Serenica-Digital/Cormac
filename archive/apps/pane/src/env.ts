import { loadBrowserEnv } from '@cormac/config';

/**
 * The pane's validated environment (ADR-034). Shared by the task pane and the
 * Lane B dialog pages (relay/callback), which run in the same Vite app. Entra
 * values are optional (Lanes A/B); the Supabase values are required, so a
 * misconfigured bundle fails fast at load. The `import.meta.env` token stays here.
 */
export const env = loadBrowserEnv(import.meta.env);
