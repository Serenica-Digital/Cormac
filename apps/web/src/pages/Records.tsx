import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useCommitRecords, useContract, useProposals, useRecords } from '../api/hooks';
import type { BusinessRecordRow, ProposalView } from '../api/types';
import { useCan, useMyRole, can } from '../lib/authz';
import { buildAttention } from '../lib/attention';
import { cycleSort, sortRows, type GridSort } from '../lib/recordSort';
import { useRecordTitles } from '../lib/titles';
import { EmptyState, ErrorNote, SetupPending, Spinner } from '../components/kit';
import { CormacPanel } from '../components/CormacPanel';
import { openSearchPalette } from '../components/SearchPalette';
import { WorkbookPane } from '../components/WorkbookPane';
import { RecordGrid } from '../components/RecordGrid/RecordGrid';
import { buildOverlay } from '../components/RecordGrid/overlay';
import { formatValue } from '../lib/format';

/**
 * The Book: the one room where the client's data and Cormac meet (ADR-0014).
 * Before the book is live, the left pane is the workbook and the conversation
 * is the setup interview; at publish, the same pane becomes the live grid and
 * the same conversation runs the everyday loop. Cell edits stage here and
 * commit as one audited batch; changes Cormac drafts arrive in the
 * conversation and highlight the cells they would touch.
 */
export function Records() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const { role } = useMyRole(workspaceId);

  if (contract.isPending || role === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-stone-400">
        <Spinner />
      </div>
    );
  }

  const noContract =
    contract.error instanceof Error && contract.error.message.includes('No active contract');
  if (contract.error && !noContract) {
    return (
      <div className="p-6">
        <ErrorNote error={contract.error} />
      </div>
    );
  }

  if (contract.data) return <LiveRoom workspaceId={workspaceId} />;
  return <SetupRoom workspaceId={workspaceId} runsSetup={can(role, 'publish_contract')} />;
}

/** Mobile-only pane switch; desktop shows both panes side by side. */
function PaneTabs({
  left,
  pane,
  setPane,
}: {
  left: string;
  pane: 'book' | 'cormac';
  setPane: (p: 'book' | 'cormac') => void;
}) {
  return (
    <div className="flex shrink-0 border-b border-border lg:hidden">
      {(['book', 'cormac'] as const).map((p) => (
        <button
          key={p}
          onClick={() => setPane(p)}
          className={`flex-1 py-2 text-sm font-medium ${
            pane === p ? 'border-b-2 border-ledger-600 text-ink' : 'text-stone-500'
          }`}
        >
          {p === 'book' ? left : 'Cormac'}
        </button>
      ))}
    </div>
  );
}

const paneClass = (visible: boolean) =>
  `min-h-0 min-w-0 flex-1 flex-col ${visible ? 'flex' : 'hidden'} lg:flex`;
const panelClass = (visible: boolean) =>
  `${visible ? 'flex' : 'hidden'} min-h-0 w-full flex-col lg:flex lg:w-auto`;

/** A "needs you" toolbar chip; clicking filters the grid to the flagged rows. */
function NeedsChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
      }`}
    >
      {children}
    </button>
  );
}

/** The Book before it is live: the workbook beside the setup conversation. */
function SetupRoom({ workspaceId, runsSetup }: { workspaceId: string; runsSetup: boolean }) {
  const [pane, setPane] = useState<'book' | 'cormac'>('book');
  const [lastCormacText, setLastCormacText] = useState<string | undefined>(undefined);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneTabs left="Workbook" pane={pane} setPane={setPane} />
      <div className="flex min-h-0 flex-1">
        <section className={paneClass(pane === 'book')}>
          <h1 className="sr-only">Your book, being set up</h1>
          {runsSetup ? (
            <WorkbookPane lastCormacText={lastCormacText} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <SetupPending workspaceId={workspaceId} live={false} />
            </div>
          )}
        </section>
        <div className={panelClass(pane === 'cormac')}>
          {runsSetup ? (
            <CormacPanel workspaceId={workspaceId} stage="setup" onCormacSaid={setLastCormacText} />
          ) : (
            <aside className="flex min-h-0 flex-col border-border bg-card px-4 py-4 lg:w-[400px] lg:border-l">
              <div className="font-display text-lg font-[560] text-ink">Cormac</div>
              <p className="mt-1 text-sm text-stone-500">
                A workspace admin is setting up this book with Cormac. You can work here the
                moment it's live.
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

/** The live Book: the grid, its toolbar, staged edits, and Cormac beside it. */
function LiveRoom({ workspaceId }: { workspaceId: string }) {
  const [pane, setPane] = useState<'book' | 'cormac'>('book');
  const contract = useContract(workspaceId);
  const objects = contract.data?.contract.objects ?? [];
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const objectApiName = activeObject ?? objects[0]?.apiName;
  const records = useRecords(workspaceId, objectApiName);
  const allRecords = useRecords(workspaceId);
  const pending = useProposals(workspaceId, 'pending');
  const commit = useCommitRecords(workspaceId);
  const canEdit = useCan(workspaceId)('edit_records');
  const titleById = useRecordTitles(workspaceId, contract.data?.contract);

  const object = objects.find((o) => o.apiName === objectApiName);

  // What needs a human today, contract-semantics driven (lib/attention.ts).
  // Spans every object; the chips below filter the grid to the flagged rows.
  const attention = useMemo(
    () =>
      buildAttention({
        objects,
        records: allRecords.data ?? [],
        pendingCount: (pending.data ?? []).length,
        now: new Date(),
      }),
    [objects, allRecords.data, pending.data],
  );
  const [needsFilter, setNeedsFilter] = useState<'follow_ups' | 'stale' | null>(null);
  const needsIds = useMemo(() => {
    if (!needsFilter) return null;
    const flagged = needsFilter === 'follow_ups' ? attention.followUps : attention.stale;
    return new Set(flagged.map((i) => i.recordId));
  }, [needsFilter, attention]);
  const toggleNeeds = (kind: 'follow_ups' | 'stale') => {
    if (needsFilter === kind) return setNeedsFilter(null);
    setNeedsFilter(kind);
    // Land the user where the flagged rows live, not on an empty tab.
    const flagged = kind === 'follow_ups' ? attention.followUps : attention.stale;
    const first = flagged[0];
    if (first && !flagged.some((i) => i.objectApiName === objectApiName)) {
      setActiveObject(first.objectApiName);
    }
  };

  // Staged, unsaved cell edits: recordId -> changed field values. Cleared when
  // the object tab changes so a Save never mixes records across objects.
  const [edits, setEdits] = useState<Map<string, Record<string, unknown>>>(new Map());
  useEffect(() => setEdits(new Map()), [objectApiName]);

  // Find and work the list: live text filter, header sort, one enum quick-filter.
  // Sort and the enum chips are per-object; the search box carries across tabs.
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<GridSort | null>(null);
  const [enumChoice, setEnumChoice] = useState<string | null>(null);
  useEffect(() => {
    setSort(null);
    setEnumChoice(null);
  }, [objectApiName]);

  // The lifecycle-ish quick filter: the object's first closed-choice field.
  const enumField = object?.fields.find((f) => f.type === 'enum' && (f.enumOptions?.length ?? 0) > 0);

  const serverRows = records.data ?? [];
  const serverById = useMemo(
    () => new Map(serverRows.map((r) => [r.id, r] as const)),
    [serverRows],
  );

  const { overlay, ghostRows, ghostIds } = useMemo(
    () => buildOverlay(pending.data ?? [], objectApiName),
    [pending.data, objectApiName],
  );

  // Default order puts what needs the user first; a header click overrides.
  const attentionRank = useMemo(() => {
    const rank = new Map<string, number>();
    attention.items.forEach((i, idx) => rank.set(i.recordId, idx));
    return rank;
  }, [attention]);

  const displayRows = useMemo<BusinessRecordRow[]>(() => {
    const base = serverRows.map((r) => {
      const e = edits.get(r.id);
      return e ? { ...r, data: { ...r.data, ...e } } : r;
    });
    let all = [...base, ...ghostRows];
    if (needsIds) all = all.filter((r) => needsIds.has(r.id));
    if (enumField && enumChoice) {
      all = all.filter((r) => r.data[enumField.apiName] === enumChoice);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      all = all.filter((r) =>
        Object.entries(r.data).some(([name, v]) => {
          if (v === null || v === undefined) return false;
          const f = object?.fields.find((x) => x.apiName === name);
          const text =
            f?.type === 'relationship' && typeof v === 'string'
              ? (titleById.get(v) ?? '')
              : String(v);
          return text.toLowerCase().includes(q);
        }),
      );
    }
    return sortRows(all, { sort, object, titleById, attentionRank });
  }, [
    serverRows,
    edits,
    ghostRows,
    needsIds,
    enumField,
    enumChoice,
    query,
    sort,
    object,
    titleById,
    attentionRank,
  ]);
  const filtering = needsFilter !== null || enumChoice !== null || query.trim() !== '';

  const dirty = useMemo(
    () => new Map([...edits].map(([id, values]) => [id, new Set(Object.keys(values))] as const)),
    [edits],
  );

  const onRowEdited = (row: BusinessRecordRow) => {
    const server = serverById.get(row.id);
    if (!server) return; // ghost rows are not editable
    setEdits((prev) => {
      const changed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row.data)) {
        if ((server.data as Record<string, unknown>)[k] !== v) changed[k] = v;
      }
      const next = new Map(prev);
      if (Object.keys(changed).length === 0) next.delete(row.id);
      else next.set(row.id, changed);
      return next;
    });
  };

  const saveEdits = () => {
    if (!objectApiName || edits.size === 0) return;
    const changes = [...edits.entries()].map(([recordId, values]) => ({
      op: 'update' as const,
      objectApiName,
      recordId,
      values,
    }));
    commit.mutate({ changes, channel: 'web' }, { onSuccess: () => setEdits(new Map()) });
  };

  // "Adjust in the grid": a proposal's update-values become staged cells the
  // user can fix and Save through the human commit path. Only offered when
  // every change is an update on the object currently in view.
  const canAdjust = (p: ProposalView) =>
    canEdit &&
    p.changes.length > 0 &&
    p.changes.every((c) => c.op === 'update' && c.objectApiName === objectApiName && c.recordId);
  const onAdjust = (p: ProposalView) => {
    setEdits((prev) => {
      const next = new Map(prev);
      for (const c of p.changes) {
        if (c.op !== 'update' || !c.recordId) continue;
        next.set(c.recordId, { ...(next.get(c.recordId) ?? {}), ...c.values });
      }
      return next;
    });
  };

  const editCount = edits.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneTabs left="Book" pane={pane} setPane={setPane} />
      <div className="flex min-h-0 flex-1">
        <section className={paneClass(pane === 'book')}>
          <h1 className="sr-only">Your book</h1>

          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-border px-3 py-2">
            {objects.map((o) => (
              <button
                key={o.apiName}
                onClick={() => setActiveObject(o.apiName)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  o.apiName === objectApiName
                    ? 'bg-ink text-paper'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {o.label}
              </button>
            ))}
            {records.data && (
              <span className="ml-2 text-xs text-stone-400">
                {serverRows.length} record{serverRows.length === 1 ? '' : 's'}
              </span>
            )}
            {attention.followUps.length > 0 && (
              <NeedsChip
                active={needsFilter === 'follow_ups'}
                onClick={() => toggleNeeds('follow_ups')}
              >
                {attention.followUps.length} follow-up
                {attention.followUps.length === 1 ? '' : 's'}
              </NeedsChip>
            )}
            {attention.stale.length > 0 && (
              <NeedsChip active={needsFilter === 'stale'} onClick={() => toggleNeeds('stale')}>
                {attention.stale.length} gone quiet
              </NeedsChip>
            )}
            {attention.pendingCount > 0 && (
              <NeedsChip active={false} onClick={() => setPane('cormac')}>
                {attention.pendingCount} waiting on you
              </NeedsChip>
            )}
            <div className="ml-auto flex items-center gap-3">
              {canEdit && editCount === 0 && serverRows.length > 0 && (
                <span className="hidden text-xs text-stone-400 xl:inline">
                  Double-click a cell to edit
                </span>
              )}
              {serverRows.length > 0 && (
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setQuery('');
                    }}
                    placeholder="Search"
                    aria-label="Search this list"
                    className="h-8 w-28 rounded-md border border-input bg-background px-2 pr-8 text-sm text-ink placeholder:text-stone-400 focus:ring-2 focus:ring-ring/40 focus:outline-none md:w-40"
                  />
                  <button
                    type="button"
                    onClick={openSearchPalette}
                    title="Search everything (⌘K)"
                    className="absolute inset-y-0 right-1 my-auto hidden h-5 cursor-pointer rounded border border-border px-1 font-mono text-[10px] leading-none text-stone-400 hover:text-ink md:block"
                  >
                    ⌘K
                  </button>
                </div>
              )}
              {canEdit && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/w/${workspaceId}/import`}>Import</Link>
                </Button>
              )}
            </div>
          </div>

          {enumField && serverRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5">
              <span className="mr-1 text-xs text-stone-400">{enumField.label}:</span>
              {(enumField.enumOptions ?? []).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setEnumChoice(enumChoice === opt ? null : opt)}
                  className={`cursor-pointer rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                    enumChoice === opt
                      ? 'bg-ink text-paper'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {opt.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          )}

          {commit.error && (
            <div className="border-b border-border px-3 py-2">
              <ErrorNote error={commit.error} />
            </div>
          )}

          <div className="min-h-0 flex-1">
            {records.isPending && (
              <div className="flex h-full items-center justify-center text-stone-400">
                <Spinner />
              </div>
            )}
            {records.error && (
              <div className="p-4">
                <ErrorNote error={records.error} />
              </div>
            )}
            {filtering && displayRows.length === 0 && serverRows.length > 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-sm text-stone-500">
                <span>Nothing on this tab matches.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNeedsFilter(null);
                    setEnumChoice(null);
                    setQuery('');
                  }}
                >
                  Show everything
                </Button>
              </div>
            )}
            {records.data && serverRows.length === 0 && ghostRows.length === 0 && (
              <div className="flex h-full items-center justify-center p-8">
                <div className="w-full max-w-md">
                  <EmptyState
                    title="No records yet"
                    hint="Bring in your spreadsheet, or tell Cormac what happened."
                    action={
                      canEdit ? (
                        <Button asChild>
                          <Link to={`/w/${workspaceId}/import`}>Import your rows</Link>
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              </div>
            )}
            {displayRows.length > 0 && object && (
              <RecordGrid
                workspaceId={workspaceId}
                object={object}
                rows={displayRows}
                overlay={overlay}
                ghostIds={ghostIds}
                dirty={dirty}
                titleById={titleById}
                editing={canEdit}
                onRowEdited={canEdit ? onRowEdited : undefined}
                sort={sort}
                onSortChange={(field) => setSort((prev) => cycleSort(prev, field))}
              />
            )}
          </div>

          {editCount > 0 && (
            <div className="flex items-center gap-3 border-t border-ledger-200 bg-ledger-50/60 px-4 py-2">
              <span className="text-sm text-ink">
                {editCount} record{editCount === 1 ? '' : 's'} with unsaved edits
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEdits(new Map())}
                  disabled={commit.isPending}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={saveEdits} busy={commit.isPending}>
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </section>

        <div className={panelClass(pane === 'cormac')}>
          <CormacPanel
            workspaceId={workspaceId}
            stage="live"
            contract={contract.data?.contract}
            attention={attention}
            canAdjust={canAdjust}
            onAdjust={onAdjust}
          />
        </div>
      </div>
    </div>
  );
}
