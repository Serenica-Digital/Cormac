import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useContract, useRecords } from '../api/hooks';
import { tableColumns } from '../contract-helpers';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
import { formatValue, formatWhen } from '@/lib/format';

export function Records() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const objects = contract.data?.contract.objects ?? [];
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const objectApiName = activeObject ?? objects[0]?.apiName;
  const records = useRecords(workspaceId, objectApiName);

  const object = objects.find((o) => o.apiName === objectApiName);
  const columns = useMemo(() => (object ? tableColumns(object) : []), [object]);

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
          title="Finish the interview first"
          hint="That's where Cormac learns how your book is organized. Records live against that structure."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Records"
        sub="The current state of the book. History lives on each record's timeline; bulk edits belong in your spreadsheet, not here."
      />

      <div className="mb-4 flex gap-1">
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
        <EmptyState title="No records yet" hint="Changes you approve land here." />
      )}

      {records.data && records.data.length > 0 && object && (
        <div className="animate-rise overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/70 text-left">
                {columns.map((c) => (
                  <th key={c.apiName} className="px-4 py-3 text-xs font-semibold tracking-wide text-stone-500">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-stone-500">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {records.data.map((r) => (
                <tr key={r.id} className="group border-b border-stone-100 last:border-0 hover:bg-ledger-50/40">
                  {columns.map((c, i) => (
                    <td key={c.apiName} className="px-4 py-3">
                      {i === 0 ? (
                        <Link
                          to={`/w/${workspaceId}/records/${r.id}`}
                          className="font-medium text-ledger-700 underline decoration-ledger-200 underline-offset-2 hover:decoration-ledger-600"
                        >
                          {formatValue(r.data[c.apiName])}
                        </Link>
                      ) : (
                        <span className="text-stone-600">{formatValue(r.data[c.apiName])}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-sm text-stone-400">
                    {formatWhen(r.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
