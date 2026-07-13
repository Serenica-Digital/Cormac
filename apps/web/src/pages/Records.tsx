import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useContract, useRecords } from '../api/hooks';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
import { RecordGrid } from '../components/RecordGrid/RecordGrid';

export function Records() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const objects = contract.data?.contract.objects ?? [];
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const objectApiName = activeObject ?? objects[0]?.apiName;
  const records = useRecords(workspaceId, objectApiName);

  const object = objects.find((o) => o.apiName === objectApiName);

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

  return (
    <div>
      <PageHeader
        title="Records"
        sub="The current state of your book, beside Cormac. History lives on each record's timeline."
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

      {records.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {records.error && <ErrorNote error={records.error} />}
      {records.data && records.data.length === 0 && (
        <EmptyState title="No records yet" hint="Import your workbook or capture a change to fill it." />
      )}

      {records.data && records.data.length > 0 && object && (
        <div className="animate-rise h-[70vh] min-h-[24rem] min-w-0 overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <RecordGrid workspaceId={workspaceId} object={object} rows={records.data} />
        </div>
      )}
    </div>
  );
}
