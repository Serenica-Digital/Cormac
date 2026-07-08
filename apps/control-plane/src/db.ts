import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

/**
 * Client factories, inlined from v0's @cormac/db (archive/packages/db) until a
 * second consumer justifies a package. No dotenv anywhere: env is injected by
 * `infisical run` (or the deployment), never loaded from a repo file.
 */

/**
 * Service-role client. Bypasses RLS, so only the control plane may ever hold
 * it. Never construct this in a surface or in the runtime.
 */
export function createServiceClient(url: string, serviceRoleKey: string): Db {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon client. Safe outside the trust boundary only because RLS enforces reach. */
export function createAnonClient(url: string, anonKey: string): Db {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * A client acting as a specific signed-in user, so RLS applies as that user.
 * Used by RLS-constrained read paths and the cross-tenant isolation test.
 */
export function createUserClient(url: string, anonKey: string, accessToken: string): Db {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
