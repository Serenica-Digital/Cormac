import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCapture, useContract, useDecision, useProposals } from '../api/hooks';
import { ProposalCard } from '../components/ProposalCard';
import { EmptyState, ErrorNote, PageHeader, SectionLabel, Spinner } from '../components/kit';

type Tab = 'pending' | 'applied' | 'rejected';

const TAB_LABELS: Record<Tab, string> = {
  pending: 'Waiting',
  applied: 'Approved',
  rejected: 'Rejected',
};

const EMPTY_COPY: Record<Tab, { title: string; hint?: string }> = {
  pending: {
    title: 'Nothing waiting on you',
    hint: "Tell Cormac what happened above — it lands here for your say-so.",
  },
  applied: { title: 'No approved changes yet' },
  rejected: { title: 'Nothing rejected yet' },
};

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
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Inbox"
        sub="Tell Cormac what happened. It proposes the change; nothing is written until you approve it."
      />

      <form onSubmit={submit} className="mb-8">
        <div className="rounded-lg bg-card p-3 ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-ring/40">
          <textarea
            className="h-20 w-full resize-none bg-transparent text-base text-ink placeholder:text-stone-400 focus:outline-none"
            placeholder='e.g. "Just closed the deal with Carter, met his partner Susan"'
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={capture.isPending}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-sm text-stone-400">
              {capture.isPending
                ? 'Cormac is reading that…'
                : 'Everything you send is kept in your History.'}
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

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <SectionLabel>Review queue</SectionLabel>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {(['pending', 'applied', 'rejected'] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="px-3">
                {TAB_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {proposals.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {proposals.error && <ErrorNote error={proposals.error} />}
      {proposals.data && proposals.data.length === 0 && (
        <EmptyState title={EMPTY_COPY[tab].title} hint={EMPTY_COPY[tab].hint} />
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
