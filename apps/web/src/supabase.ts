import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Auth broker only. The web app holds no service credentials and never writes
 * business data through Supabase; every mutation goes to the control plane
 * with the session's bearer token (the only-writer invariant).
 *
 * PKCE: OAuth and magic-link redirects land on /auth/callback as ?code=...,
 * which the client exchanges itself on load (detectSessionInUrl). The code
 * verifier lives in this browser's storage, so a magic link must be opened
 * in the browser that requested it.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { flowType: 'pkce', detectSessionInUrl: true },
});
