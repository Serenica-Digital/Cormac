import type {
  DetectedColumn,
  DetectedSheet,
  DetectionProfile,
  ParsedSheet,
  ParsedWorkbook,
} from './types';

/**
 * Header-row and type detection over a raw cell grid. Real client workbooks
 * open with banner rows above the actual headers (the fixture's header sits on
 * row 5), so "row 1 is the header" is exactly the assumption we cannot make.
 * The preview lets the user override whatever this guesses.
 */

const MAX_HEADER_SCAN = 10;

function isBlank(cell: string | undefined): boolean {
  return cell === undefined || cell.trim() === '';
}

/** Score a candidate header row: many distinct, non-numeric labels with data below. */
function headerScore(grid: string[][], rowIndex: number): number {
  const row = grid[rowIndex] ?? [];
  const cells = row.filter((c) => !isBlank(c));
  if (cells.length < 2) return 0;

  const distinct = new Set(cells.map((c) => c.trim().toLowerCase())).size;
  const nonNumeric = cells.filter((c) => !looksNumeric(c)).length;
  const below = grid[rowIndex + 1] ?? [];
  const belowFilled = below.filter((c) => !isBlank(c)).length;

  return cells.length + distinct + nonNumeric + (belowFilled >= 2 ? 3 : 0);
}

export function detectHeaderRow(grid: string[][]): number {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(grid.length, MAX_HEADER_SCAN);
  for (let r = 0; r < limit; r++) {
    const score = headerScore(grid, r);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

function looksNumeric(value: string): boolean {
  return /^-?\$?[\d,]+(\.\d+)?%?$/.test(value.trim());
}

function looksDate(value: string): boolean {
  const v = value.trim();
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) ||
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v) ||
    /^[A-Z][a-z]{2,8} \d{1,2},? \d{4}$/.test(v)
  );
}

function looksBoolean(value: string): boolean {
  return /^(true|false|yes|no)$/i.test(value.trim());
}

export function inferType(values: string[]): DetectedColumn['inferredType'] {
  const filled = values.filter((v) => !isBlank(v));
  if (filled.length === 0) return 'string';
  const all = (pred: (v: string) => boolean) => filled.every(pred);
  if (all(looksBoolean)) return 'boolean';
  if (all(looksDate)) return 'date';
  if (all(looksNumeric)) return 'number';
  return 'string';
}

function detectColumns(grid: string[][], headerRowIndex: number): DetectedColumn[] {
  const headers = grid[headerRowIndex] ?? [];
  const dataRows = grid.slice(headerRowIndex + 1);

  return headers
    .map((header, col) => ({ header: header.trim(), col }))
    .filter(({ header }) => header !== '')
    .map(({ header, col }) => {
      const values = dataRows.map((row) => row[col] ?? '');
      const filled = values.filter((v) => !isBlank(v));
      const distinct = [...new Set(filled.map((v) => v.trim()))];
      return {
        header,
        nonEmpty: filled.length,
        distinctCount: distinct.length,
        inferredType: inferType(values),
        samples: distinct.slice(0, 3),
      };
    });
}

function sampleRows(
  grid: string[][],
  headerRowIndex: number,
  columns: DetectedColumn[],
  count = 2,
): Array<Record<string, string>> {
  const headers = grid[headerRowIndex] ?? [];
  const rows = grid
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((c) => !isBlank(c)))
    .slice(0, count);
  return rows.map((row) => {
    const out: Record<string, string> = {};
    headers.forEach((h, col) => {
      const header = h.trim();
      if (header !== '' && columns.some((c) => c.header === header)) {
        out[header] = (row[col] ?? '').trim();
      }
    });
    return out;
  });
}

export function detectSheet(sheet: ParsedSheet): DetectedSheet {
  const columns = detectColumns(sheet.grid, sheet.headerRowIndex);
  const dataRowCount = sheet.grid
    .slice(sheet.headerRowIndex + 1)
    .filter((row) => row.some((c) => !isBlank(c))).length;
  return {
    name: sheet.name,
    headerRow: sheet.headerRowIndex + 1,
    rowCount: dataRowCount,
    columns,
    sampleRows: sampleRows(sheet.grid, sheet.headerRowIndex, columns),
  };
}

export function toDetectionProfile(workbook: ParsedWorkbook): DetectionProfile {
  return {
    workbookName: workbook.workbookName,
    sheets: workbook.sheets.map(detectSheet),
  };
}
