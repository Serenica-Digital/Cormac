import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, Spinner } from '@/components/ui/button';

export { Spinner };

const STATUS_VARIANTS = ['pending', 'applied', 'create', 'rejected', 'update'] as const;
type StatusVariant = (typeof STATUS_VARIANTS)[number] | 'neutral';

/** Server statuses are open-ended strings; unknown ones read as neutral. */
export function statusVariant(status: string): StatusVariant {
  return (STATUS_VARIANTS as readonly string[]).includes(status)
    ? (status as StatusVariant)
    : 'neutral';
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 px-6 py-10 text-center">
      <div className="font-display text-xl text-stone-500">{title}</div>
      {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Alert variant="destructive" className="border-red-200 bg-red-50">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * What a non-admin sees on the setup pages: a held door, not a wall of
 * buttons that would all be refused. Hide-with-context, never dead controls.
 */
export function SetupPending({ workspaceId, live }: { workspaceId: string; live: boolean }) {
  return (
    <div className="mx-auto max-w-2xl">
      {live ? (
        <EmptyState
          title="This area is for workspace admins"
          hint="Your book is live. Everyday work happens in the Inbox."
          action={
            <Button asChild>
              <Link to={`/w/${workspaceId}/inbox`}>Open your Inbox</Link>
            </Button>
          }
        />
      ) : (
        <EmptyState
          title="Your book is being set up"
          hint="A workspace admin is setting things up with Cormac. You'll be able to work here the moment it's live."
        />
      )}
    </div>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6 animate-rise">
      <h1 className="font-display text-3xl font-[560] text-ink">{title}</h1>
      {sub && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-stone-500">{sub}</p>}
    </header>
  );
}
