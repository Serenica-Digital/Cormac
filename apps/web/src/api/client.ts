import { env } from '../env';
import { supabase } from '../supabase';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The one HTTP path to the control plane (the v0 apiFetch pattern): current
 * session's bearer token, JSON in and out, server problem shape surfaced as
 * ApiError. No retries; TanStack Query owns retry policy above this.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'Not signed in');

  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { message?: string; detail?: string; error?: string };
      message = body.message ?? body.error ?? message;
      detail = body.detail;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new ApiError(res.status, message, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  // No body, and deliberately no content-type: the server's JSON parser
  // rejects an empty JSON body before the route even runs.
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
