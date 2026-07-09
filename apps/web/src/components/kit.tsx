import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold tracking-[0.12em] text-stone-500 uppercase">
      {children}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] ${className}`}>
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  const base =
    'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ledger-600 disabled:cursor-not-allowed disabled:opacity-50';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-ledger-700 text-white hover:bg-ledger-800',
    ghost: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={disabled || busy} {...rest}>
      {busy && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const chipTones: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  applied: 'bg-ledger-50 text-ledger-800 border-ledger-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  create: 'bg-ledger-50 text-ledger-800 border-ledger-200',
  update: 'bg-sky-50 text-sky-800 border-sky-200',
  neutral: 'bg-stone-100 text-stone-600 border-stone-200',
};

export function Chip({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  const cls = chipTones[tone] ?? chipTones.neutral;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 px-6 py-10 text-center">
      <div className="font-display text-xl text-stone-500">{title}</div>
      {hint && <div className="mt-1 text-sm text-stone-400">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
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
