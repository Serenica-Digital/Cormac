import ExcelJS from 'exceljs';
import { basename } from 'node:path';

/**
 * Mechanical workbook detection (ADR-023 §2): read a real .xlsx into the same
 * detected-profile shape the agent consumes. This is the deterministic,
 * code-only step. It makes no semantic judgments; it reports structure, sample
 * values, and a coarse type guess, and leaves meaning to the agent.
 *
 * Real client data: a detected profile contains PII. Callers must write it only
 * to gitignored locations and never commit it.
 */

export interface DetectedColumn {
  header: string;
  nonEmpty: number;
  distinctCount: number;
  inferredType: 'number' | 'date' | 'string';
  samples: string[];
}
export interface DetectedSheet {
  name: string;
  headerRow: number;
  rowCount: number;
  columns: DetectedColumn[];
  sampleRows: Array<Record<string, string>>;
}
export interface DetectedProfile {
  workbookName: string;
  note: string;
  sheets: DetectedSheet[];
}

const MAX_SAMPLES = 6;
const MAX_COLS = 60;

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if ('text' in v && typeof v.text === 'string') return v.text.trim(); // hyperlink / rich text
    if ('result' in v) {
      const res = v.result; // formula: show the computed value
      if (res instanceof Date) return res.toISOString().slice(0, 10);
      return String(res ?? '').trim();
    }
    if ('richText' in v && Array.isArray(v.richText))
      return (v.richText as Array<{ text?: string }>).map((p) => p.text ?? '').join('').trim();
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink.trim();
    if ('error' in v) return String(v.error);
    return ''; // unknown cell object: report empty, never "[object Object]"
  }
  return String(value).trim();
}

function guessType(samples: string[]): 'number' | 'date' | 'string' {
  const vals = samples.filter((s) => s !== '');
  if (vals.length === 0) return 'string';
  const numeric = vals.every((s) => /^-?[$£€]?[\d,]+(\.\d+)?[%kKmMbB]?$/.test(s));
  if (numeric) return 'number';
  const dateish = vals.every((s) => /\d{1,4}[/-]\d{1,2}([/-]\d{1,4})?/.test(s) || /\b\d{4}-\d{2}-\d{2}\b/.test(s));
  if (dateish) return 'date';
  return 'string';
}

function pickHeaderRow(grid: string[][]): number {
  // The header is the row (within the first 8) with the most non-empty cells.
  let best = 0;
  let bestCount = -1;
  for (let r = 0; r < Math.min(8, grid.length); r++) {
    const count = grid[r]!.filter((c) => c !== '').length;
    if (count > bestCount) {
      bestCount = count;
      best = r;
    }
  }
  return best;
}

export async function detectWorkbook(path: string): Promise<DetectedProfile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheets: DetectedSheet[] = [];

  for (const ws of wb.worksheets) {
    const nCols = Math.min(ws.columnCount, MAX_COLS);
    const grid: string[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const vals: string[] = [];
      for (let c = 1; c <= nCols; c++) vals.push(cellToString(row.getCell(c).value));
      grid.push(vals);
    }
    if (grid.length === 0) continue;

    const headerIdx = pickHeaderRow(grid);
    const headers = grid[headerIdx]!;
    const dataRows = grid.slice(headerIdx + 1).filter((row) => row.some((c) => c !== ''));

    // Keep each header with its source column index so duplicate or sparse
    // headers map to the right data, not the first matching label.
    const cols: Array<{ header: string; index: number }> = [];
    headers.forEach((header, c) => {
      const clean = header.replace(/\s+/g, ' ').trim(); // collapse in-cell line breaks in headers
      if (clean !== '') cols.push({ header: clean, index: c });
    });

    const columns: DetectedColumn[] = cols.map(({ header, index }) => {
      const nonEmptyVals = dataRows.map((row) => row[index] ?? '').filter((v) => v !== '');
      const distinct = [...new Set(nonEmptyVals)];
      const samples = distinct.slice(0, MAX_SAMPLES).map((s) => (s.length > 80 ? `${s.slice(0, 80)}...` : s));
      return {
        header,
        nonEmpty: nonEmptyVals.length,
        distinctCount: distinct.length,
        inferredType: guessType(samples),
        samples,
      };
    });

    const sampleRows = dataRows.slice(0, 3).map((row) => {
      const obj: Record<string, string> = {};
      for (const { header, index } of cols) obj[header] = row[index] ?? '';
      return obj;
    });

    sheets.push({
      name: ws.name,
      headerRow: headerIdx + 1,
      rowCount: dataRows.length,
      columns,
      sampleRows,
    });
  }

  return {
    workbookName: basename(path),
    note: 'Mechanical detection from a real .xlsx (ADR-023 §2). Structure + samples only; meaning is left to the agent.',
    sheets,
  };
}

/** Compact, low-PII structural summary for the console. */
export function summarizeProfile(p: DetectedProfile): string {
  const lines: string[] = [`workbook: ${p.workbookName} — ${p.sheets.length} sheet(s)`];
  for (const s of p.sheets) {
    lines.push(`\n  [${s.name}]  ${s.rowCount} data rows, header on row ${s.headerRow}, ${s.columns.length} columns`);
    for (const c of s.columns)
      lines.push(`    - ${c.header}  (${c.inferredType}, ${c.nonEmpty} filled, ${c.distinctCount} distinct)  e.g. ${c.samples[0] ?? ''}`);
  }
  return lines.join('\n');
}

// Standalone detection (offline, no API): tsx evals/workbook-contract/detect.ts <path.xlsx>
// Writes the profile to the gitignored local/ dir (it contains PII) and prints the structure.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, dirname } = await import('node:path');
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: tsx evals/workbook-contract/detect.ts <path.xlsx>');
    process.exit(1);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const localDir = join(here, 'local');
  mkdirSync(localDir, { recursive: true });
  const profile = await detectWorkbook(path);
  const stem = basename(path).replace(/\.[^.]+$/, '');
  writeFileSync(join(localDir, `${stem}.detected.json`), JSON.stringify(profile, null, 2));
  console.log(summarizeProfile(profile));
  console.log(`\nwrote ${stem}.detected.json to ${localDir} (gitignored)`);
}
