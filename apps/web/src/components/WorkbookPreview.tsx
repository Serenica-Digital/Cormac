import { useState } from 'react';
import type { ParsedSheet } from '../workbook/types';
import { detectSheet } from '../workbook/detect';
import { Chip } from './ui';

const PREVIEW_ROWS = 8;

/**
 * Read-only render of a parsed workbook: sheet tabs, the detected header row,
 * a handful of data rows, type chips. Deliberately not a grid editor (ADR-0010
 * boundary): click a row number to correct the header guess, highlight a
 * column, and that is the entire interaction surface.
 */
export function WorkbookPreview({
  sheets,
  onHeaderRowChange,
  highlightHeaders,
}: {
  sheets: ParsedSheet[];
  onHeaderRowChange?: (sheetName: string, headerRowIndex: number) => void;
  highlightHeaders?: Set<string>;
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
            onClick={() => setActive(i)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              i === active ? 'bg-ink text-paper' : 'text-stone-500 hover:bg-stone-100'
            }`}
          >
            {s.name}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-stone-400">
          {detected.rowCount} data rows · header on row {detected.headerRow}
          {onHeaderRowChange && ' · click a row number to correct it'}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-[13px]">
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
                  <td className="w-8 border-r border-stone-100 px-1.5 text-center align-top">
                    {onHeaderRowChange ? (
                      <button
                        onClick={() => onHeaderRowChange(sheet.name, r)}
                        title="Mark this as the header row"
                        className={`w-full rounded text-[11px] tabular-nums ${
                          isHeader
                            ? 'font-semibold text-ledger-700'
                            : 'text-stone-300 hover:bg-ledger-100 hover:text-ledger-700'
                        }`}
                      >
                        {r + 1}
                      </button>
                    ) : (
                      <span className="text-[11px] text-stone-300 tabular-nums">{r + 1}</span>
                    )}
                  </td>
                  {headerCells.map((_, c) => {
                    const cell = row[c] ?? '';
                    const header = headerCells[c] ?? '';
                    const hl = isHighlighted(header);
                    return (
                      <td
                        key={c}
                        className={`max-w-44 truncate px-2.5 py-1.5 align-top ${
                          hl ? 'bg-amber-50' : ''
                        } ${isHeader ? 'font-semibold text-ink' : 'text-stone-600'}`}
                      >
                        {isHeader ? (
                          <span className="flex items-center gap-1.5">
                            <span className={hl ? 'rounded bg-amber-100 px-1' : ''}>{cell}</span>
                          </span>
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

      <div className="mt-2 flex flex-wrap gap-1.5">
        {detected.columns.map((c) => (
          <Chip key={c.header} tone={isHighlighted(c.header) ? 'pending' : 'neutral'}>
            {c.header} · {c.inferredType}
          </Chip>
        ))}
      </div>
    </div>
  );
}
