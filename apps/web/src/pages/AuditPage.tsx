import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAudit } from '../api/hooks';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
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
        <div className="animate-rise min-w-0 overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50/70 text-xs text-stone-500 hover:bg-stone-50/70">
                <TableHead className="px-4 font-semibold">When</TableHead>
                <TableHead className="px-4 font-semibold">Who</TableHead>
                <TableHead className="px-4 font-semibold">What happened</TableHead>
                <TableHead className="px-4 font-semibold">Type</TableHead>
                <TableHead className="px-4 font-semibold">Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.data.map((e) => (
                <TableRow key={e.id} className="border-stone-100">
                  <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap text-stone-400">
                    {formatWhen(e.created_at)}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Badge variant="neutral">{e.actor_type === 'agent' ? 'Cormac' : 'you'}</Badge>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-stone-600">
                    {e.action.replaceAll('_', ' ')}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-stone-600">
                    {e.object_api_name ?? '—'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
