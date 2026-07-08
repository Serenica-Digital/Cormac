import type { TimelineEntry } from '../api/types';
import { Chip, formatValue, formatWhen } from './ui';

function changedKeys(entry: TimelineEntry): string[] {
  if (!entry.after) return [];
  const before = entry.before ?? {};
  return Object.keys(entry.after).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(entry.after?.[k]),
  );
}

/**
 * The record's history, newest first: what was said, what was proposed, what
 * was decided, what changed. A spreadsheet holds current state; this is the
 * dimension it structurally cannot.
 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-stone-400">
        No history yet. Changes land here the moment one is approved.
      </p>
    );
  }
  return (
    <ol className="relative space-y-6 border-l border-stone-200 pl-6">
      {entries.map((e) => (
        <li key={e.id} className="relative animate-rise">
          <span
            className={`absolute -left-[30px] top-1 size-2.5 rounded-full ring-4 ring-paper ${
              e.action === 'create' ? 'bg-ledger-600' : 'bg-sky-600'
            }`}
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
            <span className="font-medium text-stone-600">
              {e.action === 'create' ? 'Record created' : 'Record updated'}
            </span>
            <span>·</span>
            <span>{formatWhen(e.at)}</span>
            {e.channel && <Chip tone="neutral">{e.channel}</Chip>}
            {e.proposalStatus && <Chip tone={e.proposalStatus}>{e.proposalStatus}</Chip>}
          </div>

          {e.utterance && (
            <blockquote className="mt-1.5 border-l-2 border-ledger-200 pl-3 text-sm text-stone-700 italic">
              “{e.utterance}”
            </blockquote>
          )}

          <dl className="mt-2 space-y-1">
            {changedKeys(e).map((k) => (
              <div key={k} className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
                <dt className="w-36 shrink-0 text-stone-500">{k}</dt>
                <dd className="font-mono">
                  {e.before && e.before[k] !== undefined && e.before[k] !== null && (
                    <>
                      <span className="text-stone-400 line-through">{formatValue(e.before[k])}</span>
                      <span className="mx-1.5 text-stone-400">→</span>
                    </>
                  )}
                  <span className="text-ink">{formatValue(e.after?.[k])}</span>
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}
