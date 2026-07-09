import { Link } from 'react-router';
import type { Contract } from '@cormac/contract';
import type { ProposalView } from '../api/types';
import { fieldLabel, objectFor, recordTitle } from '../contract-helpers';
import { Button, Card, Chip, formatWhen } from './ui';
import { ValueDiff } from './ValueDiff';

export function ProposalCard({
  proposal,
  contract,
  workspaceId,
  onDecide,
  deciding,
}: {
  proposal: ProposalView;
  contract?: Contract;
  workspaceId: string;
  onDecide?: (decision: 'approve' | 'reject') => void;
  deciding?: boolean;
}) {
  return (
    <Card className="animate-rise p-4">
      <div className="flex items-center gap-2">
        <Chip tone={proposal.status}>{proposal.status}</Chip>
        {proposal.uncertain && <Chip tone="pending">uncertain — check the assumption</Chip>}
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
            <div key={i} className="rounded-md border border-stone-150 border-stone-200/70 bg-stone-50/50 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Chip tone={change.op}>{change.op}</Chip>
                <span className="font-medium text-ink">{object?.label ?? change.objectApiName}</span>
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
                  <div key={name} className="flex flex-wrap items-baseline gap-x-3">
                    <dt className="w-40 shrink-0 text-xs text-stone-500">
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

      {onDecide && proposal.status === 'pending' && (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => onDecide('approve')} busy={deciding}>
            Approve
          </Button>
          <Button variant="danger" onClick={() => onDecide('reject')} disabled={deciding}>
            Reject
          </Button>
        </div>
      )}
    </Card>
  );
}
