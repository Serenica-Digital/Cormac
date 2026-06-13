/**
 * Supabase session storage for the pane, keyed by Office.context.partitionKey so
 * a session does not bleed across Office document partitions (the same workbook
 * opened in different contexts). Falls back to plain localStorage on the web
 * host (no partition key) and to an in-memory map where storage is unavailable.
 *
 * The partition prefix is read lazily per call, because the Supabase client is
 * constructed at import time, before Office.onReady has populated the context.
 *
 * This is the pane's single persistence owner. The Lane B dialog never writes
 * here: it keeps its own PKCE state in the dialog's own origin storage and hands
 * tokens across the Office message boundary, never through shared storage.
 */

interface PaneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function partitionPrefix(): string {
  try {
    const key = typeof Office !== 'undefined' ? Office.context?.partitionKey : undefined;
    return key ? `pk:${key}:` : '';
  } catch {
    return '';
  }
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function paneStorage(): PaneStorage {
  const mem = new Map<string, string>();
  return {
    getItem(key) {
      const k = partitionPrefix() + key;
      const ls = localStore();
      return ls ? ls.getItem(k) : (mem.get(k) ?? null);
    },
    setItem(key, value) {
      const k = partitionPrefix() + key;
      const ls = localStore();
      if (ls) ls.setItem(k, value);
      else mem.set(k, value);
    },
    removeItem(key) {
      const k = partitionPrefix() + key;
      const ls = localStore();
      if (ls) ls.removeItem(k);
      else mem.delete(k);
    },
  };
}
