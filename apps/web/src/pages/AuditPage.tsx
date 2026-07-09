import { Link, useParams } from 'react-router';
import { useAudit } from '../api/hooks';
import { Chip, EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
import { formatWhen } from '@/lib/format';

export function AuditPage() {
  const { workspaceId = '' } = useParams();
  const audit = useAudit(workspaceId);

  return (
    <div>
      <PageHeader
        title="History"
        sub="Every change ever made — who made it, what changed, and what was said. Nothing here can be edited or deleted."
      />
      {audit.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {audit.error && <ErrorNote error={audit.error} />}
      {audit.data && audit.data.length === 0 && (
        <EmptyState title="Nothing yet" hint="The first approved change starts the trail." />
      )}
      {audit.data && audit.data.length > 0 && (
        <div className="animate-rise overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/70 text-left text-xs text-stone-500">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">What happened</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Record</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((e) => (
                <tr key={e.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap text-stone-400">
                    {formatWhen(e.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Chip tone="neutral">{e.actor_type === 'agent' ? 'Cormac' : 'you'}</Chip>
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">{e.action.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-2.5 text-stone-600">{e.object_api_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {e.record_id ? (
                      <Link
                        to={`/w/${workspaceId}/records/${e.record_id}`}
                        className="text-sm text-ledger-700 underline decoration-ledger-200 underline-offset-2 hover:decoration-ledger-600"
                      >
                        view
                      </Link>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
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
