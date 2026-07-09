import * as XLSX from 'xlsx';
import { detectHeaderRow } from './detect';
import type { ParsedSheet, ParsedWorkbook } from './types';

/**
 * .xlsx -> raw text grids, entirely in the browser. The server never sees the
 * file; it receives only the detection profile the user has previewed.
 */
export async function parseWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = ws
      ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][])
      : [];
    const grid = rows.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))),
    );
    // Drop fully blank trailing rows so counts and previews stay honest.
    while (grid.length > 0 && grid[grid.length - 1]!.every((c) => c.trim() === '')) grid.pop();
    return { name, grid, headerRowIndex: detectHeaderRow(grid) };
  }).filter((s) => s.grid.length > 0);

  return { workbookName: file.name, sheets };
}
