import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

/**
 * Service-role client. Bypasses RLS, so only the control plane may ever hold it
 * (ADR-003, ADR-005). Never construct this in the browser or in the runtime.
 */
export function createServiceClient(url: string, serviceRoleKey: string): Db {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon client. Safe in the browser only because RLS enforces reach (ADR-014). */
export function createAnonClient(url: string, anonKey: string): Db {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * A client acting as a specific signed-in user, so RLS applies as that user.
 * Used by read paths that should be constrained by the caller's JWT and by the
 * cross-tenant isolation test.
 */
export function createUserClient(url: string, anonKey: string, accessToken: string): Db {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
