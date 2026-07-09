import { Link, Outlet } from 'react-router';
import { useMe } from '../../api/hooks';
import { Spinner } from '../../components/kit';

/**
 * The Serenica-internal operator console: its own slim shell, not the
 * workspace chrome. This surface is not advertised: non-operators get a
 * plain nothing-here, and the client-vocabulary rules relax (contract vN,
 * agent tokens) because the audience is us. Authority lives server-side in
 * requirePlatformAdmin; this gate is presentation.
 */
export function OperatorLayout() {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper text-stone-400">
        <Spinner />
      </div>
    );
  }
  if (!me.data?.platformAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper">
        <p className="text-sm text-stone-500">There's nothing here.</p>
        <Link to="/" className="text-xs text-stone-400 underline underline-offset-2">
          Back to Cormac
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-12 items-center gap-3 border-b border-border bg-card px-4">
        <Link to="/operator" className="font-display text-lg font-[560] text-ink">
          Cormac <span className="text-stone-400">· Operator</span>
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <span className="truncate text-xs text-muted-foreground">{me.data.email}</span>
          <Link to="/" className="text-xs text-muted-foreground underline underline-offset-2">
            Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
