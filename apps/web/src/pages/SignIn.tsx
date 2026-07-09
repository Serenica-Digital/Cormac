import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../supabase';
import { Button, ErrorNote } from '../components/kit';

export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
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

  const input =
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-stone-400 focus:border-ledger-600 focus:outline-none focus:ring-2 focus:ring-ledger-100';

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl font-[560] text-ink">Cormac</div>
          <p className="mt-2 text-sm text-stone-500">Your book, kept current.</p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-[0_1px_3px_rgba(28,25,23,0.06)]"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Email</span>
            <input
              type="email"
              className={input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Password</span>
            <input
              type="password"
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <ErrorNote error={new Error(error)} />}
          <Button type="submit" busy={busy} className="w-full justify-center">
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-stone-400">Cormac, by Serenica Digital</p>
      </div>
    </div>
  );
}
