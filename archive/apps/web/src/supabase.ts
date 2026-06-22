import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// The browser only ever holds the anon key. It is safe here because RLS enforces
// what this user can reach (ADR-014). All writes go through the control-plane API.
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
