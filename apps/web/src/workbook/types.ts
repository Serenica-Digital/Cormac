/**
 * The detection profile is the shape the control plane stores and the
 * authoring agent reads (`POST /api/workspaces/:id/workbook`; fixture
 * reference: evals/workbook-authoring/fixture/relationship-crm.detected.json).
 * The browser produces it from the client's real .xlsx.
 */

export interface DetectedColumn {
  header: string;
  nonEmpty: number;
  distinctCount: number;
  inferredType: 'string' | 'number' | 'date' | 'boolean';
  samples: string[];
}

export interface DetectedSheet {
  name: string;
  /** 1-based row number of the real header row (banners above are common). */
  headerRow: number;
  /** Data rows below the header. */
  rowCount: number;
  columns: DetectedColumn[];
  sampleRows: Array<Record<string, string>>;
}

export interface DetectionProfile extends Record<string, unknown> {
  workbookName: string;
  sheets: DetectedSheet[];
}

/** What the preview renders: the profile plus the raw grid per sheet. */
export interface ParsedSheet {
  name: string;
  /** Raw cell text, row-major; empty string for blank cells. */
  grid: string[][];
  /** 0-based index of the detected (or user-overridden) header row. */
  headerRowIndex: number;
}

export interface ParsedWorkbook {
  workbookName: string;
  sheets: ParsedSheet[];
}
