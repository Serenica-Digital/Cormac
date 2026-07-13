import { useState, type FormEvent } from 'react';
import type { Contract } from '@cormac/contract';
import { Button } from '@/components/ui/button';
import { useCapture, useDecision, useProposals } from '../api/hooks';
import { useCan } from '../lib/authz';
import { useRecordTitles } from '../lib/titles';
import { ErrorNote, SectionLabel, Spinner } from './kit';
import { ProposalCard } from './ProposalCard';

/**
 * Cormac, beside the book (ADR-0014). The one place to say what happened and
 * the one home for changes waiting on a decision; the same pending changes
 * highlight on the grid cells they would touch. Sends go through capture like
 * every other door; nothing here writes.
 */
export function CormacPanel({
  workspaceId,
  contract,
}: {
  workspaceId: string;
  contract?: Contract;
}) {
  const [text, setText] = useState('');
  const [agentNote, setAgentNote] = useState<string | null>(null);

  const pending = useProposals(workspaceId, 'pending');
  const capture = useCapture(workspaceId);
  const decision = useDecision(workspaceId);
  const canDo = useCan(workspaceId);
  const canCapture = canDo('capture_update');
  const canApprove = canDo('approve_proposal');
  const titleById = useRecordTitles(workspaceId, contract);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setAgentNote(null);
    capture.mutate(trimmed, {
      onSuccess: (result) => {
        setText('');
        if (result.status === 'no_proposal') {
          setAgentNote(result.agentNote ?? 'Cormac had nothing to propose from that.');
        }
      },
    });
  }

  const waiting = pending.data ?? [];

  return (
    <aside className="flex min-h-0 flex-col border-t border-border bg-card lg:w-[380px] lg:shrink-0 lg:border-t-0 lg:border-l">
      <div className="border-b border-border px-4 py-3">
        <div className="font-display text-lg font-[560] text-ink">Cormac</div>
        <p className="text-xs text-stone-500">
          {canCapture
            ? 'Say what happened. Nothing changes without your say-so.'
            : 'Changes waiting on a decision show here.'}
        </p>
      </div>

      {canCapture && (
        <form onSubmit={submit} className="border-b border-border px-4 py-3">
          <div className="rounded-lg bg-background p-2.5 ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-ring/40">
            <textarea
              className="h-16 w-full resize-none bg-transparent text-sm text-ink placeholder:text-stone-400 focus:outline-none"
              placeholder='e.g. "Just closed the deal with Carter, met his partner Susan"'
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={capture.isPending}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-stone-400">
                {capture.isPending ? 'Cormac is reading that…' : 'Kept in your History.'}
              </span>
              <Button type="submit" size="sm" busy={capture.isPending} disabled={!text.trim()}>
                Send
              </Button>
            </div>
          </div>
          {capture.error && (
            <div className="mt-2">
              <ErrorNote error={capture.error} />
            </div>
          )}
          {agentNote && (
            <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
              <span className="font-medium text-stone-500">Cormac:</span> {agentNote}
            </div>
          )}
        </form>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Waiting on you{waiting.length > 0 ? ` (${waiting.length})` : ''}</SectionLabel>
        </div>

        {pending.isPending && (
          <div className="flex justify-center py-6 text-stone-400">
            <Spinner />
          </div>
        )}
        {pending.error && <ErrorNote error={pending.error} />}

        {pending.data && waiting.length === 0 && (
          <p className="text-sm text-stone-400">
            {canCapture
              ? 'Nothing right now. When Cormac proposes a change, it lands here and lights up on your book.'
              : 'Nothing right now.'}
          </p>
        )}

        {waiting.map((p) => (
          <ProposalCard
            key={p.id}
            compact
            proposal={p}
            contract={contract}
            titleFor={(id) => titleById.get(id)}
            workspaceId={workspaceId}
            deciding={decision.isPending && decision.variables?.proposalId === p.id}
            onDecide={
              canApprove ? (d) => decision.mutate({ proposalId: p.id, decision: d }) : undefined
            }
          />
        ))}
        {decision.error && <ErrorNote error={decision.error} />}
      </div>
    </aside>
  );
}
