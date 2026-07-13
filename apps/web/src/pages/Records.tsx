import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useCommitRecords, useContract, useProposals, useRecords } from '../api/hooks';
import { useCan } from '../lib/authz';
import { useRecordTitles } from '../lib/titles';
import { EmptyState, ErrorNote, Spinner } from '../components/kit';
import { CormacPanel } from '../components/CormacPanel';
import { RecordGrid } from '../components/RecordGrid/RecordGrid';
import { buildOverlay } from '../components/RecordGrid/overlay';
import type { BusinessRecordRow } from '../api/types';

/**
 * The Book: the workspace's home. The grid IS the page, with Cormac in a side
 * panel (ADR-0014). Cell edits stage here and commit as one audited batch;
 * pending agent changes highlight on the cells they would touch and are
 * decided in the panel.
 */
export function Records() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const objects = contract.data?.contract.objects ?? [];
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const objectApiName = activeObject ?? objects[0]?.apiName;
  const records = useRecords(workspaceId, objectApiName);
  const pending = useProposals(workspaceId, 'pending');
  const commit = useCommitRecords(workspaceId);
  const can = useCan(workspaceId);
  const canEdit = can('edit_records');
  const titleById = useRecordTitles(workspaceId, contract.data?.contract);

  const object = objects.find((o) => o.apiName === objectApiName);

  // Staged, unsaved cell edits: recordId -> changed field values. Cleared when
  // the object tab changes so a Save never mixes records across objects.
  const [edits, setEdits] = useState<Map<string, Record<string, unknown>>>(new Map());
  useEffect(() => setEdits(new Map()), [objectApiName]);

  const serverRows = records.data ?? [];
  const serverById = useMemo(() => new Map(serverRows.map((r) => [r.id, r] as const)), [serverRows]);

  // Pending agent proposals, projected onto this object's grid.
  const { overlay, ghostRows, ghostIds } = useMemo(
    () => buildOverlay(pending.data ?? [], objectApiName),
    [pending.data, objectApiName],
  );

  // What the grid shows: server rows with staged edits laid over them, plus
  // ghost rows for proposed creates. The grid never mutates data; staging lives
  // here and only a Save reaches the server.
  const displayRows = useMemo<BusinessRecordRow[]>(() => {
    const base = serverRows.map((r) => {
      const e = edits.get(r.id);
      return e ? { ...r, data: { ...r.data, ...e } } : r;
    });
    return [...base, ...ghostRows];
  }, [serverRows, edits, ghostRows]);

  // Which cells carry a staged edit, for the grid's dirty treatment.
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

  if (contract.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-stone-400">
        <Spinner />
      </div>
    );
  }

  if (contract.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <EmptyState
            title="Your book isn't set up yet"
            hint="One conversation with Cormac and your records will live here."
            action={
              <Button asChild variant="outline">
                <Link to={`/w/${workspaceId}/start`}>Get started</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const editCount = edits.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section className="flex min-h-0 min-w-0 flex-[2] flex-col">
        <h1 className="sr-only">Your book</h1>

        {/* Toolbar: object tabs, count, actions. The grid below is the page. */}
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

        {/* Staged edits commit from here; pinned to the pane's bottom edge. */}
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

      <CormacPanel workspaceId={workspaceId} contract={contract.data?.contract} />
    </div>
  );
}
