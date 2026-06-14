import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

/**
 * Lane B relay page (runs inside the Office dialog, our origin). It kicks off the
 * Supabase Azure OAuth code flow; the PKCE verifier it writes to this dialog's
 * own storage is read back by callback.html (same origin, same dialog) to
 * complete the exchange. A dedicated client with its own storageKey keeps this
 * separate from the pane's session store.
 */
const supa = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
    storageKey: 'cormac-dialog-auth',
  },
});

async function start(): Promise<void> {
  const redirectTo = `${window.location.origin}/callback.html`;
  const { error } = await supa.auth.signInWithOAuth({
    provider: 'azure',
    options: { redirectTo, scopes: 'openid profile email' },
  });
  if (error) {
    try {
      Office.context.ui.messageParent(JSON.stringify({ error: error.message }));
    } catch {
      /* not in a dialog; nothing to report to */
    }
  }
}

if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
  Office.onReady().then(start, start);
} else {
  void start();
}
