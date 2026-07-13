import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  useCommitRecords,
  useContract,
  useDecision,
  useProposals,
  useRecords,
} from '../api/hooks';
import { useCan } from '../lib/authz';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
import { ProposalCard } from '../components/ProposalCard';
import { RecordGrid } from '../components/RecordGrid/RecordGrid';
import { buildOverlay } from '../components/RecordGrid/overlay';
import type { BusinessRecordRow } from '../api/types';

export function Records() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const objects = contract.data?.contract.objects ?? [];
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const objectApiName = activeObject ?? objects[0]?.apiName;
  const records = useRecords(workspaceId, objectApiName);
  const pending = useProposals(workspaceId, 'pending');
  const decision = useDecision(workspaceId);
  const commit = useCommitRecords(workspaceId);
  const can = useCan(workspaceId);
  const canApprove = can('approve_proposal');
  const canEdit = can('edit_records');

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
  const objectProposals = useMemo(
    () =>
      (pending.data ?? []).filter((p) => p.changes.some((c) => c.objectApiName === objectApiName)),
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
      <div className="flex justify-center py-16 text-stone-400">
        <Spinner />
      </div>
    );
  }

  if (contract.error) {
    return (
      <div>
        <PageHeader title="Records" />
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
    );
  }

  const editCount = edits.size;

  return (
    <div>
      <PageHeader
        title="Records"
        sub={
          canEdit
            ? 'Your book, beside Cormac. Edit a cell to change it, or confirm a pending change; both apply through the same pipeline.'
            : 'The current state of your book, beside Cormac. Pending changes show inline.'
        }
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {objects.map((o) => (
          <button
            key={o.apiName}
            onClick={() => setActiveObject(o.apiName)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              o.apiName === objectApiName
                ? 'bg-ink text-paper'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {objectProposals.length > 0 && (
        <div className="mb-5 space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
            Pending changes ({objectProposals.length})
          </h2>
          {objectProposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              contract={contract.data?.contract}
              workspaceId={workspaceId}
              onDecide={
                canApprove ? (d) => decision.mutate({ proposalId: p.id, decision: d }) : undefined
              }
              deciding={decision.isPending && decision.variables?.proposalId === p.id}
            />
          ))}
        </div>
      )}

      {editCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ledger-200 bg-ledger-50/60 px-4 py-2.5">
          <span className="text-sm text-ink">
            {editCount} record{editCount === 1 ? '' : 's'} with unsaved edits
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setEdits(new Map())} disabled={commit.isPending}>
              Discard
            </Button>
            <Button onClick={saveEdits} busy={commit.isPending}>
              Save changes
            </Button>
          </div>
        </div>
      )}
      {commit.error && <ErrorNote error={commit.error} />}

      {records.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {records.error && <ErrorNote error={records.error} />}
      {serverRows.length === 0 && ghostRows.length === 0 && (
        <EmptyState
          title="No records yet"
          hint="Import your workbook or capture a change to fill it."
        />
      )}

      {displayRows.length > 0 && object && (
        <div className="animate-rise h-[70vh] min-h-[24rem] min-w-0 overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <RecordGrid
            workspaceId={workspaceId}
            object={object}
            rows={displayRows}
            overlay={overlay}
            ghostIds={ghostIds}
            editing={canEdit}
            onRowEdited={canEdit ? onRowEdited : undefined}
          />
        </div>
      )}
    </div>
  );
}
