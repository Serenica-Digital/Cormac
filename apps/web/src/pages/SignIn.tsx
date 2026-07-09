import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '../supabase';
import { ErrorNote } from '../components/kit';

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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl font-[560] text-ink">Cormac</div>
          <p className="mt-2 text-sm text-stone-500">Your book, kept current.</p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
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
          {error && <ErrorNote error={new Error(error)} />}
          <Button type="submit" size="lg" busy={busy} className="w-full justify-center">
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-stone-400">Cormac, by Serenica Digital</p>
      </div>
    </div>
  );
}
