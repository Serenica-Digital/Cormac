import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Contract } from '@cormac/contract';
import { useContract, useRecords } from '../api/hooks';
import type { BusinessRecordRow } from '../api/types';
import { objectFor, recordTitle } from '../contract-helpers';

/**
 * The five-second answer to "where's Morgan?": Cmd+K, type, Enter — from any
 * page in the workspace. Searches every record in the book client-side (the
 * all-records query the Book already rides; beta books are small) and jumps
 * to the record's page.
 */

const PALETTE_EVENT = 'cormac:search-palette';

/** Open the workspace search palette from anywhere (e.g. the Book's toolbar). */
export function openSearchPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

// The binding accepts both meta and ctrl everywhere; the label shows the
// key this platform actually uses.
const isApple =
  typeof navigator !== 'undefined' && /Mac|iP(hone|od|ad)/.test(navigator.platform);
export const searchShortcutLabel = isApple ? '⌘K' : 'Ctrl+K';

/**
 * Mounts once per live workspace (WorkspaceLayout): owns the open state, the
 * Cmd/Ctrl+K binding, and the record data the palette searches.
 */
export function SearchPaletteHost({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const contract = useContract(workspaceId);
  const records = useRecords(workspaceId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  return (
    <SearchPalette
      open={open}
      onClose={() => setOpen(false)}
      workspaceId={workspaceId}
      contract={contract.data?.contract}
      records={records.data ?? []}
    />
  );
}

interface Hit {
  record: BusinessRecordRow;
  title: string;
  objectLabel: string;
  /** Lower ranks first: title prefix, then title match, then any-field match. */
  rank: number;
}

function findHits(
  query: string,
  records: BusinessRecordRow[],
  contract: Contract | undefined,
  cap = 8,
): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: Hit[] = [];
  for (const record of records) {
    if (record.archived_at) continue;
    const object = objectFor(contract, record.object_api_name);
    if (!object) continue;
    const title = recordTitle(object, record.data);
    const titleLower = title.toLowerCase();
    let rank: number | null = null;
    if (titleLower.startsWith(q)) rank = 0;
    else if (titleLower.includes(q)) rank = 1;
    else {
      const inField = Object.values(record.data).some(
        (v) => typeof v === 'string' && v.toLowerCase().includes(q),
      );
      if (inField) rank = 2;
    }
    if (rank !== null) hits.push({ record, title, objectLabel: object.label, rank });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title)).slice(0, cap);
}

export function SearchPalette({
  open,
  onClose,
  workspaceId,
  contract,
  records,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  contract?: Contract;
  records: BusinessRecordRow[];
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // The dialog mounts on open; focus after it paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const hits = useMemo(() => findHits(query, records, contract), [query, records, contract]);
  const active = hits[Math.min(cursor, hits.length - 1)];

  if (!open) return null;

  const go = (hit: Hit) => {
    onClose();
    navigate(`/w/${workspaceId}/records/${hit.record.id}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-[1px]"
      onMouseDown={onClose}
      role="dialog"
      aria-label="Search your book"
    >
      <div
        className="mx-auto mt-[14vh] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, hits.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            }
            if (e.key === 'Enter' && active) go(active);
          }}
          placeholder="Search your book…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-[15px] text-ink placeholder:text-stone-400 focus:outline-none"
        />
        {query.trim() && hits.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-stone-400">
            Nothing in your book matches "{query.trim()}".
          </p>
        )}
        {hits.length > 0 && (
          <ul className="max-h-[40vh] overflow-y-auto py-1">
            {hits.map((hit, i) => (
              <li key={hit.record.id}>
                <button
                  className={`flex w-full cursor-pointer items-baseline gap-2 px-4 py-2 text-left text-sm ${
                    hit === active ? 'bg-ledger-50 text-ink' : 'text-stone-700'
                  }`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(hit)}
                >
                  <span className="truncate font-medium">{hit.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-stone-400">{hit.objectLabel}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!query.trim() && (
          <p className="px-4 py-4 text-xs text-stone-400">
            Type a name. Enter opens the record; Esc closes.
          </p>
        )}
      </div>
    </div>
  );
}
