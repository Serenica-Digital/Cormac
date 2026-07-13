import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Contract } from '@cormac/contract';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthoringTurn, useCapture, useDecision, useProposals } from '../api/hooks';
import type { ProposalView } from '../api/types';
import { fieldLabel, objectFor, recordTitle } from '../contract-helpers';
import { dayOf, dayWord, type Attention, type AttentionItem } from '../lib/attention';
import { useCan } from '../lib/authz';
import { useRecordTitles } from '../lib/titles';
import { ErrorNote } from './kit';
import { ValueDiff } from './ValueDiff';

/**
 * Cormac: one persona, one continuous conversation, from first setup through
 * everyday work (ADR-0014). Before the book is live the conversation drives
 * the authoring interview; after, it drives capture. Changes Cormac wants to
 * make arrive as things Cormac SAYS, with the decision attached; a correction
 * is just the next reply. Cormac never writes; every change exits through the
 * pipeline.
 */

interface ChatMessage {
  role: 'user' | 'cormac';
  text: string;
  at: string;
}

type FeedItem =
  | { kind: 'message'; at: string; message: ChatMessage }
  | { kind: 'proposal'; at: string; proposal: ProposalView };

// The setup key predates this component (the interview page); keep it so
// existing transcripts survive the merge.
const chatKey = (workspaceId: string, stage: 'setup' | 'live') =>
  stage === 'setup' ? `cormac:interview:${workspaceId}` : `cormac:book:${workspaceId}`;

function loadChat(key: string): ChatMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      role: string;
      text: string;
      at: string;
    }>;
    // The interview page stored role 'agent'; normalize to 'cormac'.
    return raw.map((m) => ({ ...m, role: m.role === 'user' ? 'user' : 'cormac' }) as ChatMessage);
  } catch {
    return [];
  }
}

export function CormacPanel({
  workspaceId,
  stage,
  contract,
  attention,
  canAdjust,
  onAdjust,
  onCormacSaid,
}: {
  workspaceId: string;
  stage: 'setup' | 'live';
  contract?: Contract;
  /** What needs the user today (lib/attention.ts); drives the greeting. */
  attention?: Attention;
  /** Whether "Adjust in the grid" applies to this proposal (active object, updates only). */
  canAdjust?: (p: ProposalView) => boolean;
  /** Stage the proposal's values as editable cells; the panel then rejects it. */
  onAdjust?: (p: ProposalView) => void;
  /** Fires with Cormac's latest words (drives the workbook column highlights). */
  onCormacSaid?: (text: string) => void;
}) {
  const key = chatKey(workspaceId, stage);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat(key));
  const [draft, setDraft] = useState('');
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canDo = useCan(workspaceId);
  const canTalk = stage === 'setup' ? canDo('publish_contract') : canDo('capture_update');
  const canApprove = canDo('approve_proposal');

  const authoring = useAuthoringTurn(workspaceId);
  const capture = useCapture(workspaceId);
  const decision = useDecision(workspaceId);
  const pending = useProposals(workspaceId, stage === 'live' ? 'pending' : undefined);
  const titleById = useRecordTitles(workspaceId, contract);
  const busy = authoring.isPending || capture.isPending;
  const sendError = authoring.error ?? capture.error;

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(messages));
  }, [messages, key]);

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = messages.map((m) => ({ kind: 'message', at: m.at, message: m }));
    if (stage === 'live') {
      for (const p of pending.data ?? []) {
        items.push({ kind: 'proposal', at: p.createdAt, proposal: p });
      }
    }
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [messages, pending.data, stage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [feed.length, busy]);

  const say = (text: string) => {
    setMessages((prev) => [...prev, { role: 'cormac', text, at: new Date().toISOString() }]);
    onCormacSaid?.(text);
  };

  function send(text: string) {
    setLastFailed(null);
    setMessages((prev) => [...prev, { role: 'user', text, at: new Date().toISOString() }]);
    if (stage === 'setup') {
      authoring.mutate(text, {
        onSuccess: (outcome) => say(outcome.output),
        onError: () => setLastFailed(text),
      });
    } else {
      capture.mutate(text, {
        onSuccess: (result) => {
          if (result.status === 'no_proposal') {
            say(result.agentNote ?? 'Nothing in your book needs to change for that.');
          }
          // A proposal arrives in the feed itself (pending query invalidates).
        },
        onError: () => setLastFailed(text),
      });
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    send(text);
  }

  function decide(p: ProposalView, verdict: 'approve' | 'reject', keep?: number[]) {
    decision.mutate(
      { proposalId: p.id, decision: verdict, keep },
      {
        onSuccess: (result) =>
          say(
            verdict === 'reject'
              ? 'Okay, I’ve dropped that.'
              : result.droppedCount > 0
                ? `Done — ${result.applied.length} of ${result.applied.length + result.droppedCount} are in your book; I dropped the rest.`
                : 'Done — it’s in your book.',
          ),
      },
    );
  }

  function adjust(p: ProposalView) {
    onAdjust?.(p);
    decision.mutate(
      { proposalId: p.id, decision: 'reject' },
      {
        onSuccess: () =>
          say('I’ve put those values into your grid — fix what’s off and hit Save.'),
      },
    );
  }

  return (
    <aside className="flex min-h-0 flex-1 flex-col border-border bg-card lg:w-[400px] lg:shrink-0 lg:border-l">
      <div className="flex items-start justify-between border-b border-border px-4 py-3">
        <div>
          <div className="font-display text-lg font-[560] text-ink">Cormac</div>
          <p className="text-xs text-stone-500">
            {stage === 'setup'
              ? 'Sets up your book in one conversation.'
              : 'Keeps your book. Nothing changes without your say-so.'}
          </p>
        </div>
        {messages.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear this conversation from view?</AlertDialogTitle>
                <AlertDialogDescription>
                  This only clears what's shown here. Your book and its history are unaffected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => setMessages([])}>Clear it</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {stage === 'live' && attention && (
          <AttentionGreeting attention={attention} workspaceId={workspaceId} />
        )}
        {feed.length === 0 && !hasAttention(attention) && (
          <div className="py-8 text-center">
            <div className="font-display text-lg text-stone-500">
              {stage === 'setup' ? 'Start when you’re ready.' : 'This is your line to Cormac.'}
            </div>
            <p className="mx-auto mt-2 max-w-[260px] text-sm text-stone-400">
              {stage === 'setup'
                ? 'Something like “hi — I brought my relationship tracker, let’s set up my book” works fine.'
                : canTalk
                  ? 'Tell it what happened, or ask about your book. Changes it drafts land here for your OK.'
                  : 'Changes waiting on a decision show here.'}
            </p>
          </div>
        )}

        {feed.map((item, i) =>
          item.kind === 'message' ? (
            <ChatBubble key={`m${i}`} message={item.message} />
          ) : (
            <ProposalMessage
              key={item.proposal.id}
              proposal={item.proposal}
              contract={contract}
              titleFor={(id) => titleById.get(id)}
              deciding={decision.isPending && decision.variables?.proposalId === item.proposal.id}
              onDecide={canApprove ? (v, keep) => decide(item.proposal, v, keep) : undefined}
              onAdjust={
                canApprove && onAdjust && canAdjust?.(item.proposal)
                  ? () => adjust(item.proposal)
                  : undefined
              }
            />
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-stone-400">
            <span className="text-2xs font-semibold tracking-[0.16em] text-ledger-700">CORMAC</span>
            <span className="inline-flex gap-1">
              <span className="thinking-dot size-1.5 rounded-full bg-stone-400" />
              <span className="thinking-dot size-1.5 rounded-full bg-stone-400" />
              <span className="thinking-dot size-1.5 rounded-full bg-stone-400" />
            </span>
            {stage === 'setup' && <span>thinking — a long pause is normal on the final review</span>}
          </div>
        )}
        {sendError && lastFailed && (
          <div className="space-y-2">
            <ErrorNote error={sendError} />
            <Button variant="outline" size="sm" onClick={() => send(lastFailed)}>
              Retry that message
            </Button>
          </div>
        )}
        {decision.error && <ErrorNote error={decision.error} />}
      </div>

      {canTalk && (
        <form onSubmit={submit} className="border-t border-border p-3">
          <div className="rounded-lg bg-background p-2 ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-ring/40">
            <textarea
              className="h-14 w-full resize-none bg-transparent px-1 text-sm text-ink placeholder:text-stone-400 focus:outline-none"
              placeholder={
                busy
                  ? 'Cormac is thinking…'
                  : stage === 'setup'
                    ? 'Say something to Cormac'
                    : 'Tell Cormac what happened, or ask about your book'
              }
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(e);
                }
              }}
              disabled={busy}
            />
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <span className="text-xs text-stone-400">Kept in your History.</span>
              <Button type="submit" size="sm" busy={busy} disabled={!draft.trim()}>
                Send
              </Button>
            </div>
          </div>
        </form>
      )}
    </aside>
  );
}

function hasAttention(a?: Attention): boolean {
  return !!a && (a.items.length > 0 || a.pendingCount > 0);
}

/**
 * Cormac speaks first: what needs the user today, composed from the book's
 * semantic tags. Deliberately templated and rule-based (no fake agent voice);
 * upgrading it to the real agent is #115. Not persisted: it reflects the book
 * right now, so it recomputes on every visit rather than piling up in history.
 */
function AttentionGreeting({
  attention,
  workspaceId,
}: {
  attention: Attention;
  workspaceId: string;
}) {
  if (!hasAttention(attention)) return null;
  const { followUps, stale, pendingCount } = attention;
  const now = new Date();
  const today = dayOf(now);
  const salutation = now.getHours() < 12 ? 'Morning.' : now.getHours() < 18 ? 'Afternoon.' : 'Evening.';

  const CAP = 4;
  const names = (items: AttentionItem[], note: (i: AttentionItem) => string) => (
    <>
      {items.slice(0, CAP).map((i, idx) => (
        <span key={i.recordId}>
          {idx > 0 && ', '}
          <Link
            to={`/w/${workspaceId}/records/${i.recordId}`}
            className="font-medium text-ink underline decoration-stone-300 underline-offset-2 hover:decoration-ink"
          >
            {i.title}
          </Link>{' '}
          ({note(i)})
        </span>
      ))}
      {items.length > CAP && ` and ${items.length - CAP} more`}
    </>
  );

  return (
    <div className="animate-rise max-w-[95%]">
      <div className="mb-1 text-2xs font-semibold tracking-[0.16em] text-ledger-700">CORMAC</div>
      <div className="space-y-1.5 text-sm leading-relaxed text-stone-800">
        <p>
          {salutation}
          {followUps.length > 0 && (
            <>
              {' '}
              {followUps.length} follow-up{followUps.length === 1 ? '' : 's'} need
              {followUps.length === 1 ? 's' : ''} you —{' '}
              {names(followUps, (i) =>
                i.kind === 'follow_up_overdue'
                  ? `was due ${dayWord(i.date, today)}`
                  : dayWord(i.date, today),
              )}
              .
            </>
          )}
        </p>
        {stale.length > 0 && (
          <p>Gone quiet: {names(stale, (i) => `${-i.days} days`)}.</p>
        )}
        {pendingCount > 0 && (
          <p>
            {pendingCount} change{pendingCount === 1 ? ' is' : 's are'} waiting on your OK below.
          </p>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="animate-rise flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-sm whitespace-pre-wrap text-paper">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="animate-rise max-w-[95%]">
      <div className="mb-1 text-2xs font-semibold tracking-[0.16em] text-ledger-700">CORMAC</div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
        {message.text}
      </div>
    </div>
  );
}

/**
 * A change Cormac wants to make, said in the conversation: the diff plus the
 * decision. Approve applies it; Adjust hands the values to your grid to fix
 * yourself; Reject drops it. When Cormac proposes several changes at once,
 * each can be skipped individually — Approve applies the kept ones and the
 * skipped ones are dropped on the audit trail (#114). A correction in words
 * is just the next message.
 */
function ProposalMessage({
  proposal,
  contract,
  titleFor,
  deciding,
  onDecide,
  onAdjust,
}: {
  proposal: ProposalView;
  contract?: Contract;
  titleFor: (id: string) => string | undefined;
  deciding: boolean;
  onDecide?: (verdict: 'approve' | 'reject', keep?: number[]) => void;
  onAdjust?: () => void;
}) {
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const total = proposal.changes.length;
  const keptCount = total - skipped.size;
  const skippable = onDecide !== undefined && total > 1;

  const toggleSkip = (i: number) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const approve = () =>
    onDecide?.(
      'approve',
      skipped.size > 0
        ? proposal.changes.map((_, i) => i).filter((i) => !skipped.has(i))
        : undefined,
    );

  return (
    <div className="animate-rise max-w-[95%]">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-2xs font-semibold tracking-[0.16em] text-ledger-700">CORMAC</span>
        {proposal.uncertain && <Badge variant="pending">not sure — check me</Badge>}
      </div>
      {proposal.notes && (
        <p className="mb-2 text-sm leading-relaxed text-stone-800">{proposal.notes}</p>
      )}
      <div className="space-y-2 rounded-lg border border-ledger-200 bg-ledger-50/40 p-3">
        {proposal.changes.map((change, i) => {
          const object = objectFor(contract, change.objectApiName);
          const resolve = (name: string, v: unknown): unknown => {
            const field = object?.fields.find((x) => x.apiName === name);
            if (field?.type === 'relationship' && typeof v === 'string') return titleFor(v) ?? v;
            return v;
          };
          const isSkipped = skipped.has(i);
          return (
            <div key={i}>
              <div className="flex items-baseline gap-2">
                <div
                  className={`text-xs font-medium ${isSkipped ? 'text-stone-400 line-through' : 'text-ink'}`}
                >
                  {change.op === 'create' ? 'New' : 'Update'}{' '}
                  {object?.label ?? change.objectApiName}
                  {change.op === 'update' && change.recordId && (
                    <span className="text-stone-500">
                      {' '}
                      · {titleFor(change.recordId) ?? (change.current ? recordTitle(object, change.current) : '')}
                    </span>
                  )}
                </div>
                {skippable && (
                  <button
                    type="button"
                    onClick={() => toggleSkip(i)}
                    disabled={deciding}
                    className="ml-auto shrink-0 cursor-pointer text-xs text-stone-400 underline decoration-stone-300 underline-offset-2 hover:text-ink"
                  >
                    {isSkipped ? 'Keep this one' : 'Skip this one'}
                  </button>
                )}
              </div>
              <dl className={`mt-1.5 space-y-1 ${isSkipped ? 'opacity-40' : ''}`}>
                {Object.keys(change.values).map((name) => (
                  <div key={name} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-stone-500">{fieldLabel(object, name)}</dt>
                    <dd>
                      <ValueDiff
                        current={
                          change.op === 'update'
                            ? resolve(name, change.current?.[name])
                            : undefined
                        }
                        proposed={resolve(name, change.values[name])}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
        {onDecide ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={approve} busy={deciding} disabled={keptCount === 0}>
              {skipped.size > 0 ? `Approve ${keptCount} of ${total}` : 'Approve'}
            </Button>
            {onAdjust && (
              <Button size="sm" variant="outline" onClick={onAdjust} disabled={deciding}>
                Adjust in the grid
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => onDecide('reject')} disabled={deciding}>
              Reject
            </Button>
            {keptCount === 0 && (
              <span className="text-xs text-stone-400">Everything is skipped — that's a Reject.</span>
            )}
          </div>
        ) : (
          <p className="pt-1 text-xs text-stone-400">Waiting for a manager's OK.</p>
        )}
      </div>
    </div>
  );
}
