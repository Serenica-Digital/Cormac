import type { ParsedWorkbook } from './types';

/**
 * The parsed workbook stays client-side (the server stores only the detection
 * profile, and exposes no human read route for it yet). Stashing it per
 * workspace lets the interview page show the preview beside the conversation.
 */
const key = (workspaceId: string) => `cormac:workbook:${workspaceId}`;

export function saveParsedWorkbook(workspaceId: string, wb: ParsedWorkbook): void {
  try {
    localStorage.setItem(key(workspaceId), JSON.stringify(wb));
  } catch {
    // Oversized workbook: the interview simply won't show the side panel.
  }
}

export function loadParsedWorkbook(workspaceId: string): ParsedWorkbook | null {
  const raw = localStorage.getItem(key(workspaceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParsedWorkbook;
  } catch {
    return null;
  }
}
