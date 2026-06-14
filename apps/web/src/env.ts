import { loadBrowserEnv } from '@cormac/config';

/**
 * The web app's validated environment (ADR-034). `loadBrowserEnv` throws at module
 * load if a required VITE_* value is missing, so a misconfigured bundle fails
 * fast and loud instead of silently building a broken Supabase client. The
 * `import.meta.env` token stays here, in app code, where Vite expects it.
 */
export const env = loadBrowserEnv(import.meta.env);
