import { createClient } from '@supabase/supabase-js';
import { paneStorage } from './auth/storage';
import { env } from './env';

/**
 * The pane's one Supabase client and one persistence owner. All three sign-in
 * lanes converge here, so everything downstream of a session is lane-blind,
 * mirroring the control plane, which validates any Supabase JWT regardless of
 * how it was minted (apps/api/src/auth.ts).
 *
 * detectSessionInUrl is OFF: the pane is not an OAuth redirect target. Lane B's
 * callback page runs the code exchange in the dialog and returns tokens via
 * messageParent, which the dialog lane feeds to setSession.
 */
export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: paneStorage(),
      storageKey: 'cormac-pane-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);
