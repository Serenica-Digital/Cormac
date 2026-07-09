import { useState } from 'react';
import type { DetectedColumn, ParsedSheet } from '../workbook/types';
import { detectSheet } from '../workbook/detect';

const PREVIEW_ROWS = 8;

/** Client-facing words for inferred column types. */
export function typeWord(t: DetectedColumn['inferredType']): string {
  switch (t) {
    case 'string':
      return 'text';
    case 'boolean':
      return 'yes/no';
    default:
      return t; // number, date
  }
}

/**
 * Read-only render of a parsed workbook: sheet tabs, the detected header row,
 * a handful of data rows. Deliberately not a grid editor (ADR-0010 boundary):
 * click a row number to correct the header guess, highlight a column, and
 * that is the entire interaction surface. Column metadata is NOT rendered
 * here; the Workbook page owns the client-facing "columns we found" summary.
 */
export function WorkbookPreview({
  sheets,
  onHeaderRowChange,
  highlightHeaders,
  onActiveSheetChange,
}: {
  sheets: ParsedSheet[];
  onHeaderRowChange?: (sheetName: string, headerRowIndex: number) => void;
  highlightHeaders?: Set<string>;
  onActiveSheetChange?: (sheetName: string) => void;
}) {
  const [active, setActive] = useState(0);
  const sheet = sheets[active];
  if (!sheet) return null;

  const detected = detectSheet(sheet);
  const headerCells = sheet.grid[sheet.headerRowIndex] ?? [];
  const visibleRows = sheet.grid.slice(0, sheet.headerRowIndex + 1 + PREVIEW_ROWS);
  const isHighlighted = (header: string) =>
    highlightHeaders?.has(header.trim().toLowerCase()) ?? false;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {sheets.map((s, i) => (
          <button
            key={s.name}
            onClick={() => {
              setActive(i);
              onActiveSheetChange?.(s.name);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              i === active ? 'bg-ink text-paper' : 'text-stone-500 hover:bg-stone-100'
            }`}
          >
            {s.name}
          </button>
        ))}
        <span className="ml-auto text-xs text-stone-400">
          {detected.rowCount} rows · titles on row {detected.headerRow}
          {onHeaderRowChange && ' — wrong? click the right row number'}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <tbody>
            {visibleRows.map((row, r) => {
              const isHeader = r === sheet.headerRowIndex;
              const isBanner = r < sheet.headerRowIndex;
              return (
                <tr
                  key={r}
                  className={
                    isHeader
                      ? 'border-y border-ledger-200 bg-ledger-50/70'
                      : isBanner
                        ? 'bg-stone-50/60 text-stone-400'
                        : 'border-b border-stone-100 last:border-0'
                  }
                >
                  <td className="w-9 border-r border-stone-100 px-1.5 text-center align-top">
                    {onHeaderRowChange ? (
                      <button
                        onClick={() => onHeaderRowChange(sheet.name, r)}
                        title="Mark this as the row with your column titles"
                        className={`w-full rounded text-xs tabular-nums ${
                          isHeader
                            ? 'font-semibold text-ledger-700'
                            : 'text-stone-300 hover:bg-ledger-100 hover:text-ledger-700'
                        }`}
                      >
                        {r + 1}
                      </button>
                    ) : (
                      <span className="text-xs text-stone-300 tabular-nums">{r + 1}</span>
                    )}
                  </td>
                  {headerCells.map((_, c) => {
                    const cell = row[c] ?? '';
                    const header = headerCells[c] ?? '';
                    const hl = isHighlighted(header);
                    return (
                      <td
                        key={c}
                        className={`max-w-48 truncate px-3 py-2 align-top ${hl ? 'bg-amber-50' : ''} ${
                          isHeader ? 'font-semibold text-ink' : 'text-stone-600'
                        }`}
                      >
                        {isHeader ? (
                          <span className={hl ? 'rounded bg-amber-100 px-1' : ''}>{cell}</span>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
