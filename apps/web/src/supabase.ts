import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Auth broker only. The web app holds no service credentials and never writes
 * business data through Supabase; every mutation goes to the control plane
 * with the session's bearer token (the only-writer invariant).
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
