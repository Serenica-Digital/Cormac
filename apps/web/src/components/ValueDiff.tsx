import { formatValue } from './ui';

/**
 * A single field's current -> proposed rendering: the review queue's whole
 * job is making this comparison legible before anything is written.
 */
export function ValueDiff({ current, proposed }: { current: unknown; proposed: unknown }) {
  const hasCurrent = current !== null && current !== undefined && current !== '';
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1.5 font-mono text-xs">
      {hasCurrent && (
        <>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-500 line-through decoration-stone-400">
            {formatValue(current)}
          </span>
          <span aria-hidden className="text-stone-400">
            →
          </span>
        </>
      )}
      <span className="rounded bg-ledger-50 px-1.5 py-0.5 font-medium text-ledger-800">
        {formatValue(proposed)}
      </span>
    </span>
  );
}
