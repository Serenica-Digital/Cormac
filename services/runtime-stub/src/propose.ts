/**
 * A deliberately small stand-in for the Hermes product runtime (ADR-006). It
 * mirrors the runtime's HTTP I/O so the walking skeleton runs end to end without
 * the real model. It is intentionally dumb: naive name matching and keyword
 * extraction. Its only contract with the rest of the system is the shape it
 * returns. It holds no database access and proposes; it never writes.
 *
 * It also models a misbehaving runtime: if asked to set a rating, it will try to
 * write the human-only `internal_rating` field. The control plane must reject
 * that, which proves the agent-editability gate (ADR-005).
 *
 * These types are declared locally on purpose. The real runtime is a separate
 * Python service; coupling the stub to the app's packages would misrepresent the
 * boundary.
 */

export interface RecordSummary {
  objectApiName: string;
  id: string;
  display: Record<string, unknown>;
}

export interface ProposeRequest {
  workspaceId: string;
  contract: unknown;
  text: string;
  records: RecordSummary[];
}

export interface ProposedChange {
  objectApiName: string;
  op: 'create' | 'update';
  recordId?: string;
  values: Record<string, unknown>;
  rationale?: string;
}

export interface ProposeResponse {
  changes: ProposedChange[];
  notes?: string;
  uncertain: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function detectStatus(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\b(interested|active|engaged|warm)\b/.test(t)) return 'active';
  if (/\b(dormant|cold|stale|quiet|gone\s+quiet)\b/.test(t)) return 'dormant';
  if (/\b(lead|prospect)\b/.test(t)) return 'lead';
  return undefined;
}

function matchPerson(records: RecordSummary[], text: string): RecordSummary | undefined {
  const haystack = text.toLowerCase();
  let best: RecordSummary | undefined;
  let bestLen = 0;
  for (const record of records) {
    if (record.objectApiName !== 'person') continue;
    const fullName = String(record.display.full_name ?? '').trim();
    if (!fullName) continue;
    for (const token of [fullName, ...fullName.split(/\s+/)]) {
      if (token.length >= 2 && haystack.includes(token.toLowerCase()) && token.length > bestLen) {
        best = record;
        bestLen = token.length;
      }
    }
  }
  return best;
}

function extractName(text: string): string | undefined {
  const m = text.match(
    /\b(?:[Ww]ith|[Tt]o|[Mm]et|[Ss]aw|[Cc]alled|[Ee]mailed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
  );
  return m?.[1];
}

export function propose(req: ProposeRequest): ProposeResponse {
  const { text, records } = req;

  const values: Record<string, unknown> = {
    last_interaction_date: today(),
    last_interaction_note: text.trim(),
  };
  const status = detectStatus(text);
  if (status) values.status = status;

  // Overreach on request, so the control plane's human-only gate is provable.
  const rating = text.match(/rating\s+(?:to\s+)?(\d+)/i);
  if (rating) values.internal_rating = Number(rating[1]);

  const matched = matchPerson(records, text);
  if (matched) {
    return {
      changes: [
        {
          objectApiName: 'person',
          op: 'update',
          recordId: matched.id,
          values,
          rationale: 'matched an existing person by name',
        },
      ],
      uncertain: false,
    };
  }

  const name = extractName(text);
  if (name) {
    return {
      changes: [
        {
          objectApiName: 'person',
          op: 'create',
          values: { full_name: name, ...values },
          rationale: 'no existing match; extracted a new contact name',
        },
      ],
      uncertain: false,
    };
  }

  return {
    changes: [
      {
        objectApiName: 'person',
        op: 'create',
        values: { full_name: 'New Contact', ...values },
        rationale: 'could not identify a person from the message',
      },
    ],
    notes: 'Could not identify a specific person; review before applying.',
    uncertain: true,
  };
}
