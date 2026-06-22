import type { CSSProperties } from 'react';

/** Shared pane styling, kept deliberately plain (this is a measurement spike,
 * not a product surface). Mirrors apps/web's inline-style approach. */
export const ui: Record<string, CSSProperties> = {
  page: { maxWidth: 560, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif', fontSize: 13 },
  card: { border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 },
  h2: { fontSize: 13, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1, color: '#333' },
  button: { padding: '5px 10px', borderRadius: 6, border: '1px solid #888', cursor: 'pointer', background: '#fff', marginRight: 6 },
  input: { padding: 6, borderRadius: 6, border: '1px solid #bbb', width: '100%', boxSizing: 'border-box' },
  error: { background: '#fde8e8', color: '#9b1c1c', padding: 8, borderRadius: 6, marginBottom: 8 },
  ok: { color: '#146c43', fontWeight: 600 },
  bad: { color: '#9b1c1c', fontWeight: 600 },
  mono: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, wordBreak: 'break-all' },
  pill: { fontSize: 11, padding: '1px 6px', borderRadius: 10, background: '#eef', marginLeft: 6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', borderBottom: '1px solid #ccc', padding: '4px 6px', color: '#555' },
  td: { borderBottom: '1px solid #eee', padding: '4px 6px' },
  muted: { color: '#777' },
};
