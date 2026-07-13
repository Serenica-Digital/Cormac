import { Link } from 'react-router';
import type { Contract } from '@cormac/contract';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ProposalView } from '../api/types';
import { fieldLabel, objectFor, recordTitle } from '../contract-helpers';
import { formatWhen } from '@/lib/format';
import { statusVariant } from './kit';
import { ValueDiff } from './ValueDiff';

export function ProposalCard({
  proposal,
  contract,
  workspaceId,
  onDecide,
  deciding,
  compact,
}: {
  proposal: ProposalView;
  contract?: Contract;
  workspaceId: string;
  onDecide?: (decision: 'approve' | 'reject') => void;
  deciding?: boolean;
  /** Narrow-column rendering (side panel): stacked field rows, tighter padding. */
  compact?: boolean;
}) {
  return (
    <Card className={`animate-rise gap-0 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant(proposal.status)}>{proposal.status}</Badge>
        {proposal.uncertain && <Badge variant="pending">uncertain — check the assumption</Badge>}
        <span className="ml-auto text-xs text-stone-400">{formatWhen(proposal.createdAt)}</span>
      </div>

      {proposal.notes && (
        <p className="mt-2 border-l-2 border-stone-200 pl-3 text-sm text-stone-600 italic">
          {proposal.notes}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {proposal.changes.map((change, i) => {
          const object = objectFor(contract, change.objectApiName);
          const fieldNames = Object.keys(change.values);
          return (
            <div key={i} className="rounded-md border border-stone-200/70 bg-stone-50/50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={change.op}>{change.op}</Badge>
                <span className="font-medium text-ink">
                  {object?.label ?? change.objectApiName}
                </span>
                {change.op === 'update' && change.recordId && (
                  <Link
                    to={`/w/${workspaceId}/records/${change.recordId}`}
                    className="text-ledger-700 underline decoration-ledger-200 underline-offset-2 hover:decoration-ledger-600"
                  >
                    {change.current ? recordTitle(object, change.current) : 'view record'}
                  </Link>
                )}
              </div>
              <dl className="mt-2 space-y-1.5">
                {fieldNames.map((name) => (
                  <div
                    key={name}
                    className={
                      compact
                        ? 'flex flex-col gap-0.5'
                        : 'flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-x-3'
                    }
                  >
                    <dt className={`shrink-0 text-xs text-stone-500 ${compact ? '' : 'sm:w-40'}`}>
                      {fieldLabel(object, name)}
                    </dt>
                    <dd>
                      <ValueDiff
                        current={change.op === 'update' ? change.current?.[name] : undefined}
                        proposed={change.values[name]}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      {proposal.status === 'pending' &&
        (onDecide ? (
          <div className="mt-4 flex gap-2">
            <Button onClick={() => onDecide('approve')} busy={deciding}>
              Approve
            </Button>
            <Button variant="danger" onClick={() => onDecide('reject')} disabled={deciding}>
              Reject
            </Button>
          </div>
        ) : (
          // Roles that cannot decide see where the proposal stands, not
          // disabled buttons they could never press.
          <p className="mt-4 text-xs text-stone-400">Waiting for a manager's approval.</p>
        ))}
    </Card>
  );
}
