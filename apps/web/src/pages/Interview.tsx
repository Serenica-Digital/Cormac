import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuthoringTurn, useContract } from '../api/hooks';
import { WorkbookPreview } from '../components/WorkbookPreview';
import { ErrorNote, PageHeader, SectionLabel } from '../components/kit';
import { loadParsedWorkbook } from '../workbook/store';

interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
  at: string;
}

const transcriptKey = (workspaceId: string) => `cormac:interview:${workspaceId}`;

function loadTranscript(workspaceId: string): ChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(transcriptKey(workspaceId)) ?? '[]') as ChatMessage[];
  } catch {
    return [];
  }
}

/**
 * The authoring interview. Each send is one synchronous turn against the
 * server-side conversation (the server holds true state; this transcript is
 * display history). The submit turn can run long; the input stays locked and
 * the thinking indicator honest until the reply lands.
 *
 * Layout: the conversation gets a comfortable reading column; the workbook
 * sits below it at full width so its table has real room.
 */
export function Interview() {
  const { workspaceId = '' } = useParams();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadTranscript(workspaceId));
  const [draft, setDraft] = useState('');
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const turn = useAuthoringTurn(workspaceId);
  const contract = useContract(workspaceId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const workbook = useMemo(() => loadParsedWorkbook(workspaceId), [workspaceId]);

  useEffect(() => {
    localStorage.setItem(transcriptKey(workspaceId), JSON.stringify(messages));
  }, [messages, workspaceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, turn.isPending]);

  // Columns the agent just referred to get highlighted in the preview below.
  const highlights = useMemo(() => {
    const lastAgent = [...messages].reverse().find((m) => m.role === 'agent');
    if (!lastAgent || !workbook) return new Set<string>();
    const text = lastAgent.text.toLowerCase();
    const set = new Set<string>();
    for (const sheet of workbook.sheets) {
      const headers = sheet.grid[sheet.headerRowIndex] ?? [];
      for (const h of headers) {
        const header = h.trim();
        if (header.length >= 3 && text.includes(header.toLowerCase())) {
          set.add(header.toLowerCase());
        }
      }
    }
    return set;
  }, [messages, workbook]);

  function send(text: string) {
    setLastFailed(null);
    setMessages((prev) => [...prev, { role: 'user', text, at: new Date().toISOString() }]);
    turn.mutate(text, {
      onSuccess: (outcome) => {
        setMessages((prev) => [
          ...prev,
          { role: 'agent', text: outcome.output, at: new Date().toISOString() },
        ]);
      },
      onError: () => setLastFailed(text),
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || turn.isPending) return;
    setDraft('');
    send(text);
  }

  return (
    <div>
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Talk with Cormac"
            sub="A conversation about how you actually work. Cormac asks one thing at a time and sets up your book the way you approve."
          />
          {messages.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="mt-1 shrink-0 text-muted-foreground">
                  Clear chat
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear this conversation from view?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This only clears what's shown here. Cormac's memory of your setup is
                    unaffected.
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

        {contract.data && (
          <div className="mb-4 animate-rise rounded-md border border-ledger-200 bg-ledger-50 px-4 py-3 text-sm text-ledger-800">
            Your structure is live (v{contract.data.version}).{' '}
            <Link
              to={`/w/${workspaceId}/contract`}
              className="font-medium underline decoration-ledger-400 underline-offset-2 hover:decoration-ledger-700"
            >
              See how Cormac understands your book →
            </Link>
          </div>
        )}

        <div className="flex h-[65dvh] min-h-[22rem] flex-col rounded-xl bg-card ring-1 ring-foreground/10">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-5">
            {messages.length === 0 && (
              <div className="mx-auto max-w-sm py-10 text-center">
                <div className="font-display text-xl text-stone-500">Start when you're ready.</div>
                <p className="mt-2 text-sm text-stone-400">
                  Something like “hi — I brought my relationship tracker, let's set up my
                  workspace” works fine. Share your workbook first if you haven't.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`animate-rise flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-base text-paper'
                      : 'max-w-[92%]'
                  }
                >
                  {m.role === 'agent' && (
                    <div className="mb-1 text-2xs font-semibold tracking-[0.16em] text-ledger-700">
                      CORMAC
                    </div>
                  )}
                  <div
                    className={
                      m.role === 'agent'
                        ? 'text-base leading-relaxed whitespace-pre-wrap text-stone-800'
                        : 'whitespace-pre-wrap'
                    }
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            ))}
            {turn.isPending && (
              <div className="flex items-center gap-2 text-sm text-stone-400">
                <span className="font-semibold tracking-[0.16em] text-ledger-700 text-2xs">
                  CORMAC
                </span>
                <span className="inline-flex gap-1">
                  <span className="thinking-dot size-1.5 rounded-full bg-stone-400" />
                  <span className="thinking-dot size-1.5 rounded-full bg-stone-400" />
                  <span className="thinking-dot size-1.5 rounded-full bg-stone-400" />
                </span>
                <span className="text-sm">
                  thinking — a long pause is normal on the final review
                </span>
              </div>
            )}
            {turn.error && lastFailed && (
              <div className="space-y-2">
                <ErrorNote error={turn.error} />
                <Button variant="outline" onClick={() => send(lastFailed)}>
                  Retry that message
                </Button>
              </div>
            )}
          </div>
          <form onSubmit={submit} className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Textarea
                className="max-h-40 min-h-11 flex-1 resize-y bg-background text-base"
                placeholder={turn.isPending ? 'Cormac is thinking…' : 'Say something to Cormac'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit(e);
                  }
                }}
                disabled={turn.isPending}
              />
              <Button type="submit" size="lg" busy={turn.isPending} disabled={!draft.trim()}>
                Send
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="mt-8 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <SectionLabel>Your workbook</SectionLabel>
          {highlights.size > 0 && (
            <span className="text-xs text-muted-foreground">
              Cormac just mentioned {highlights.size} of your columns
            </span>
          )}
        </div>
        <div className="mt-2">
          {workbook ? (
            <WorkbookPreview sheets={workbook.sheets} highlightHeaders={highlights} />
          ) : (
            <div className="rounded-lg border border-dashed border-stone-300 px-5 py-8 text-center text-sm text-stone-400">
              Your workbook isn't showing here yet.{' '}
              <Link
                to={`/w/${workspaceId}/workbook`}
                className="text-ledger-700 underline decoration-ledger-300 underline-offset-2 hover:decoration-ledger-600"
              >
                Bring it in
              </Link>{' '}
              to follow along as Cormac asks about your columns.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
