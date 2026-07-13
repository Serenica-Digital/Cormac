import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useCommitRecords, useContract, useProposals, useRecords } from '../api/hooks';
import type { BusinessRecordRow, ProposalView } from '../api/types';
import { useCan, useMyRole, can } from '../lib/authz';
import { useRecordTitles } from '../lib/titles';
import { EmptyState, ErrorNote, SetupPending, Spinner } from '../components/kit';
import { CormacPanel } from '../components/CormacPanel';
import { WorkbookPane } from '../components/WorkbookPane';
import { RecordGrid } from '../components/RecordGrid/RecordGrid';
import { buildOverlay } from '../components/RecordGrid/overlay';

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
  const pending = useProposals(workspaceId, 'pending');
  const commit = useCommitRecords(workspaceId);
  const canEdit = useCan(workspaceId)('edit_records');
  const titleById = useRecordTitles(workspaceId, contract.data?.contract);

  const object = objects.find((o) => o.apiName === objectApiName);

  // Staged, unsaved cell edits: recordId -> changed field values. Cleared when
  // the object tab changes so a Save never mixes records across objects.
  const [edits, setEdits] = useState<Map<string, Record<string, unknown>>>(new Map());
  useEffect(() => setEdits(new Map()), [objectApiName]);

  const serverRows = records.data ?? [];
  const serverById = useMemo(
    () => new Map(serverRows.map((r) => [r.id, r] as const)),
    [serverRows],
  );

  const { overlay, ghostRows, ghostIds } = useMemo(
    () => buildOverlay(pending.data ?? [], objectApiName),
    [pending.data, objectApiName],
  );

  const displayRows = useMemo<BusinessRecordRow[]>(() => {
    const base = serverRows.map((r) => {
      const e = edits.get(r.id);
      return e ? { ...r, data: { ...r.data, ...e } } : r;
    });
    return [...base, ...ghostRows];
  }, [serverRows, edits, ghostRows]);

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
            <div className="ml-auto flex items-center gap-3">
              {canEdit && editCount === 0 && serverRows.length > 0 && (
                <span className="hidden text-xs text-stone-400 xl:inline">
                  Double-click a cell to edit
                </span>
              )}
              {canEdit && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/w/${workspaceId}/import`}>Import</Link>
                </Button>
              )}
            </div>
          </div>

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
            canAdjust={canAdjust}
            onAdjust={onAdjust}
          />
        </div>
      </div>
    </div>
  );
}
