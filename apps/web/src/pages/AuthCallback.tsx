import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession } from '../auth/useSession';
import { Spinner } from '../components/kit';

/**
 * Where OAuth and magic-link redirects land. supabase-js (PKCE +
 * detectSessionInUrl) exchanges the ?code= itself; this page only waits for
 * the session to appear and hands off to the app. Provider errors arrive as
 * error_description in the query or hash; a timeout catches the silent
 * failure modes (most commonly a magic link opened in a different browser
 * than the one that requested it - the PKCE verifier lives in that browser).
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [timedOut, setTimedOut] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const errorDescription = params.get('error_description') ?? hashParams.get('error_description');

  useEffect(() => {
    if (session) navigate('/', { replace: true });
  }, [session, navigate]);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (errorDescription || timedOut) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-4 text-center">
        <div className="font-display text-2xl font-[560] text-ink">
          That sign-in didn't go through
        </div>
        <p className="max-w-sm text-sm text-stone-500">
          {errorDescription ??
            'The link may have expired, or it was opened in a different browser than the one that asked for it.'}
        </p>
        <Link to="/signin" className="text-sm text-ledger-700 underline underline-offset-2">
          Try signing in again
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper text-stone-400">
      <Spinner />
      <p className="text-sm">Signing you in…</p>
    </div>
  );
}
