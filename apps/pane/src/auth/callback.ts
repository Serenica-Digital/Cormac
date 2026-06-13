import { createClient } from '@supabase/supabase-js';

/**
 * Lane B callback page (runs inside the Office dialog, our origin). Entra has
 * redirected here with ?code=...; we exchange it for a session using the PKCE
 * verifier relay.html stored under the same storageKey in this origin, then hand
 * the tokens to the pane with messageParent. Nothing persists to the pane's
 * store; the pane owns persistence and calls setSession itself.
 */
const supa = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
    storageKey: 'cormac-dialog-auth',
  },
});

function send(payload: Record<string, unknown>): void {
  try {
    Office.context.ui.messageParent(JSON.stringify(payload));
  } catch {
    /* not in a dialog; the parent will time out */
  }
}

async function complete(): Promise<void> {
  const code = new URL(window.location.href).searchParams.get('code');
  if (!code) {
    send({ error: 'no code in callback url' });
    return;
  }
  const { data, error } = await supa.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    send({ error: error?.message ?? 'code exchange failed' });
    return;
  }
  send({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}

if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
  Office.onReady().then(complete, complete);
} else {
  void complete();
}
