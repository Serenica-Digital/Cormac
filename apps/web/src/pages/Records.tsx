import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useContract, useDecision, useProposals, useRecords } from '../api/hooks';
import { useCan } from '../lib/authz';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
import { ProposalCard } from '../components/ProposalCard';
import { RecordGrid } from '../components/RecordGrid/RecordGrid';
import { buildOverlay } from '../components/RecordGrid/overlay';

export function Records() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const objects = contract.data?.contract.objects ?? [];
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const objectApiName = activeObject ?? objects[0]?.apiName;
  const records = useRecords(workspaceId, objectApiName);
  const pending = useProposals(workspaceId, 'pending');
  const decision = useDecision(workspaceId);
  const canApprove = useCan(workspaceId)('approve_proposal');

  const object = objects.find((o) => o.apiName === objectApiName);

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

  const gridRows = records.data ? [...records.data, ...ghostRows] : [];

  return (
    <div>
      <PageHeader
        title="Records"
        sub="The current state of your book, beside Cormac. Pending changes show inline; confirm them to apply."
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
                canApprove
                  ? (d) => decision.mutate({ proposalId: p.id, decision: d })
                  : undefined
              }
              deciding={decision.isPending && decision.variables?.proposalId === p.id}
            />
          ))}
        </div>
      )}

      {records.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {records.error && <ErrorNote error={records.error} />}
      {records.data && records.data.length === 0 && ghostRows.length === 0 && (
        <EmptyState
          title="No records yet"
          hint="Import your workbook or capture a change to fill it."
        />
      )}

      {gridRows.length > 0 && object && (
        <div className="animate-rise h-[70vh] min-h-[24rem] min-w-0 overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <RecordGrid
            workspaceId={workspaceId}
            object={object}
            rows={gridRows}
            overlay={overlay}
            ghostIds={ghostIds}
          />
        </div>
      )}
    </div>
  );
}
