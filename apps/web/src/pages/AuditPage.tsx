import { Link, useParams } from 'react-router';
import { useAudit } from '../api/hooks';
import { Chip, EmptyState, ErrorNote, formatWhen, PageHeader, Spinner } from '../components/ui';

export function AuditPage() {
  const { workspaceId = '' } = useParams();
  const audit = useAudit(workspaceId);

  return (
    <div>
      <PageHeader
        title="Audit"
        sub="Append-only, kept by the system itself. Every write that ever happened, with who and what."
      />
      {audit.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {audit.error && <ErrorNote error={audit.error} />}
      {audit.data && audit.data.length === 0 && (
        <EmptyState title="No events yet" hint="The first approved change starts the trail." />
      )}
      {audit.data && audit.data.length > 0 && (
        <div className="animate-rise overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/70 text-left text-xs text-stone-500">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">Actor</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
                <th className="px-4 py-2.5 font-semibold">Object</th>
                <th className="px-4 py-2.5 font-semibold">Record</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((e) => (
                <tr key={e.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-2 text-xs whitespace-nowrap text-stone-400">
                    {formatWhen(e.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <Chip tone="neutral">{e.actor_type}</Chip>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-stone-600">{e.action}</td>
                  <td className="px-4 py-2 text-stone-600">{e.object_api_name ?? '—'}</td>
                  <td className="px-4 py-2">
                    {e.record_id ? (
                      <Link
                        to={`/w/${workspaceId}/records/${e.record_id}`}
                        className="font-mono text-xs text-ledger-700 underline underline-offset-2"
                      >
                        {e.record_id.slice(0, 8)}…
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
