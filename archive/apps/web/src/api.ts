import { env } from './env';

const API_URL = env.VITE_API_URL;

/**
 * Call the control-plane API with the user's bearer token. Everything dangerous
 * (capture, approve, apply) goes through here, not directly to the database.
 */
export async function apiFetch<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request failed (${res.status})`;
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? (body as { detail?: unknown }).detail
        : undefined;
    throw new Error(detail ? `${message}: ${JSON.stringify(detail)}` : message);
  }
  return body as T;
}

export interface ProposalChangeView {
  objectApiName: string;
  op: 'create' | 'update';
  recordId: string | null;
  values: Record<string, unknown>;
  current: Record<string, unknown> | null;
}

export interface ProposalView {
  id: string;
  status: string;
  createdAt: string;
  sourceMessageId: string;
  uncertain: boolean;
  notes?: string;
  changes: ProposalChangeView[];
}

export interface RecordRow {
  id: string;
  object_api_name: string;
  data: Record<string, unknown>;
  updated_at: string;
}

export interface AuditRow {
  id: string;
  actor_type: string;
  action: string;
  object_api_name: string | null;
  record_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}
