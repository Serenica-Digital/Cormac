import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useCapture, useContract, useDecision, useProposals } from '../api/hooks';
import { ProposalCard } from '../components/ProposalCard';
import { Button, EmptyState, ErrorNote, PageHeader, SectionLabel, Spinner } from '../components/ui';

type Tab = 'pending' | 'applied' | 'rejected';

export function Inbox() {
  const { workspaceId = '' } = useParams();
  const [text, setText] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [agentNote, setAgentNote] = useState<string | null>(null);

  const contract = useContract(workspaceId);
  const proposals = useProposals(workspaceId, tab);
  const capture = useCapture(workspaceId);
  const decision = useDecision(workspaceId);

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

  return (
    <div>
      <PageHeader
        title="Inbox"
        sub="Tell Cormac what happened. It proposes the change; nothing is written until you approve it."
      />

      <form onSubmit={submit} className="mb-8">
        <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-[0_1px_2px_rgba(28,25,23,0.04)] focus-within:border-ledger-500 focus-within:ring-2 focus-within:ring-ledger-100">
          <textarea
            className="h-20 w-full resize-none bg-transparent text-sm text-ink placeholder:text-stone-400 focus:outline-none"
            placeholder='e.g. "Just closed the deal with Carter, met his partner Susan"'
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={capture.isPending}
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-stone-400">
              {capture.isPending ? 'Cormac is reading that…' : 'Captured to the audit trail, always.'}
            </span>
            <Button type="submit" busy={capture.isPending} disabled={!text.trim()}>
              Send to Cormac
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

      <div className="mb-3 flex items-center gap-4">
        <SectionLabel>Review queue</SectionLabel>
        <div className="flex gap-1">
          {(['pending', 'applied', 'rejected'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tab === t ? 'bg-ink text-paper' : 'text-stone-500 hover:bg-stone-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {proposals.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {proposals.error && <ErrorNote error={proposals.error} />}
      {proposals.data && proposals.data.length === 0 && (
        <EmptyState
          title={tab === 'pending' ? 'Nothing waiting on you' : `No ${tab} proposals yet`}
          hint={tab === 'pending' ? 'Capture something above and it lands here for review.' : undefined}
        />
      )}
      <div className="space-y-4">
        {proposals.data?.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            contract={contract.data?.contract}
            workspaceId={workspaceId}
            deciding={decision.isPending && decision.variables?.proposalId === p.id}
            onDecide={(d) => decision.mutate({ proposalId: p.id, decision: d })}
          />
        ))}
      </div>
      {decision.error && (
        <div className="mt-3">
          <ErrorNote error={decision.error} />
        </div>
      )}
    </div>
  );
}
