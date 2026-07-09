import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleIcon, MicrosoftIcon } from '../components/brand-icons';
import { supabase } from '../supabase';
import { ErrorNote } from '../components/kit';

type Mode = 'password' | 'magic' | 'sent';

/**
 * Three doors, one broker: OAuth (Microsoft is provider id `azure` in
 * Supabase), email+password, and a magic link. Whatever the door, the result
 * is the same Supabase session, and the control plane verifies its JWT the
 * same way - sign-in strategy never touches the backend.
 *
 * The magic link rides the PKCE flow, so it must be opened in the browser
 * that requested it (the code verifier lives in this browser's storage);
 * an OTP-code fallback is the future escape hatch if that bites.
 */
export function SignIn() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = `${window.location.origin}/auth/callback`;

  async function oauth(provider: 'azure' | 'google') {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // Entra tokens omit the email claim unless asked.
        ...(provider === 'azure' ? { scopes: 'email' } : {}),
      },
    });
    if (err) setError(err.message);
    // On success the browser is navigating away; nothing to do here.
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate('/', { replace: true });
  }

  async function submitMagic(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMode('sent');
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl font-[560] text-ink">Cormac</div>
          <p className="mt-2 text-sm text-stone-500">Your book, kept current.</p>
        </div>

        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          {mode === 'sent' ? (
            <div className="space-y-4 text-center">
              <div className="font-display text-xl font-[560] text-ink">Check your email</div>
              <p className="text-sm leading-relaxed text-stone-600">
                We sent a sign-in link to <span className="font-medium text-ink">{email}</span>.
                Open it in this browser and you're in.
              </p>
              <div className="flex flex-col items-center gap-2 text-xs">
                <button
                  onClick={() => setMode('magic')}
                  className="text-stone-500 underline underline-offset-2 hover:text-stone-700"
                >
                  Send it again
                </button>
                <button
                  onClick={() => setMode('password')}
                  className="text-stone-400 hover:text-stone-600"
                >
                  Back to sign in
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2"
                  onClick={() => void oauth('azure')}
                >
                  <MicrosoftIcon />
                  Continue with Microsoft
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-center gap-2"
                  onClick={() => void oauth('google')}
                >
                  <GoogleIcon />
                  Continue with Google
                </Button>
              </div>

              <div className="flex items-center gap-3 text-xs text-stone-400">
                <span className="h-px flex-1 bg-border" aria-hidden />
                or
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>

              <form
                onSubmit={mode === 'magic' ? submitMagic : submitPassword}
                className="space-y-4"
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-stone-500">Email</span>
                  <Input
                    type="email"
                    className="h-10 text-base"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                {mode === 'password' && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-stone-500">Password</span>
                    <Input
                      type="password"
                      className="h-10 text-base"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                )}
                {error && <ErrorNote error={new Error(error)} />}
                <Button type="submit" size="lg" busy={busy} className="w-full justify-center">
                  {mode === 'magic' ? 'Email me a sign-in link' : 'Sign in'}
                </Button>
              </form>

              <button
                onClick={() => {
                  setError(null);
                  setMode(mode === 'magic' ? 'password' : 'magic');
                }}
                className="mx-auto block text-xs text-stone-500 underline underline-offset-2 hover:text-stone-700"
              >
                {mode === 'magic'
                  ? 'Sign in with a password instead'
                  : 'Email me a sign-in link instead'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stone-400">Cormac, by Serenica Digital</p>
      </div>
    </div>
  );
}
