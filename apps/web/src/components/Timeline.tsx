import type { ContractObject } from '@cormac/contract';
import { Badge } from '@/components/ui/badge';
import type { TimelineEntry } from '../api/types';
import { fieldLabel } from '../contract-helpers';
import { statusVariant } from './kit';
import { formatValue, formatWhen } from '@/lib/format';

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
export function Timeline({
  entries,
  object,
  titleFor,
}: {
  entries: TimelineEntry[];
  /** The record's contract object, for field labels and relationship names. */
  object?: ContractObject;
  /** Resolve a record id to its human handle (for relationship values). */
  titleFor?: (recordId: string) => string | undefined;
}) {
  // Field keys and relationship ids are internals; show labels and names.
  const resolve = (key: string, v: unknown): unknown => {
    const field = object?.fields.find((f) => f.apiName === key);
    if (field?.type === 'relationship' && typeof v === 'string') return titleFor?.(v) ?? v;
    return v;
  };

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
              e.action === 'record_created' ? 'bg-ledger-600' : 'bg-sky-600'
            }`}
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
            <span className="font-medium text-stone-600">
              {e.action === 'record_created'
                ? 'Record created'
                : e.action === 'record_updated'
                  ? 'Record updated'
                  : e.action.replaceAll('_', ' ')}
            </span>
            <span>·</span>
            <span>{formatWhen(e.at)}</span>
            {e.channel && <Badge variant="neutral">{e.channel}</Badge>}
            {e.proposalStatus && (
              <Badge variant={statusVariant(e.proposalStatus)}>{e.proposalStatus}</Badge>
            )}
          </div>

          {e.utterance && (
            <blockquote className="mt-1.5 border-l-2 border-ledger-200 pl-3 text-sm text-stone-700 italic">
              “{e.utterance}”
            </blockquote>
          )}

          <dl className="mt-2 space-y-1">
            {changedKeys(e).map((k) => (
              <div key={k} className="flex flex-wrap items-baseline gap-x-3 text-xs">
                <dt className="w-36 shrink-0 text-stone-500">{fieldLabel(object, k)}</dt>
                <dd className="font-mono">
                  {e.before && e.before[k] !== undefined && e.before[k] !== null && (
                    <>
                      <span className="text-stone-400 line-through">
                        {formatValue(resolve(k, e.before[k]))}
                      </span>
                      <span className="mx-1.5 text-stone-400">→</span>
                    </>
                  )}
                  <span className="text-ink">{formatValue(resolve(k, e.after?.[k]))}</span>
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}
