/**
 * Probes C, D, E against the open workbook through Office.js.
 *  C: context.sync() read latency on a realistic multi-sheet workbook, and the
 *     payload size where the ~5 MB read ceiling bites.
 *  D: highlight an agent-named range (the interview's column-pointing gesture).
 *  E: onChanged reliability, including the data-validation-dropdown gap on web
 *     and the Local vs Remote source.
 */

export interface SheetSummary {
  name: string;
  rowCount: number;
  colCount: number;
  address: string;
  approxBytes: number;
  error?: string;
}

export interface WorkbookSummary {
  sheets: SheetSummary[];
  totalCells: number;
  approxBytes: number;
  syncCount: number;
  totalSyncMs: number;
}

/** Probe C. Reads the used range of every sheet, timing the syncs and measuring
 * the JSON payload so the report can show where the read ceiling is hit. */
export async function readWorkbookSummary(): Promise<WorkbookSummary> {
  return Excel.run(async (ctx) => {
    let syncCount = 0;
    let totalSyncMs = 0;
    const timedSync = async () => {
      const t0 = performance.now();
      await ctx.sync();
      totalSyncMs += performance.now() - t0;
      syncCount += 1;
    };

    const sheets = ctx.workbook.worksheets;
    sheets.load('items/name');
    await timedSync();

    const summaries: SheetSummary[] = [];
    let totalCells = 0;
    let approxBytes = 0;

    for (const sheet of sheets.items) {
      const used = sheet.getUsedRangeOrNullObject();
      used.load(['address', 'rowCount', 'columnCount', 'values']);
      try {
        await timedSync();
        if (used.isNullObject) {
          summaries.push({ name: sheet.name, rowCount: 0, colCount: 0, address: '(empty)', approxBytes: 0 });
          continue;
        }
        const bytes = JSON.stringify(used.values).length;
        const cells = used.rowCount * used.columnCount;
        totalCells += cells;
        approxBytes += bytes;
        summaries.push({
          name: sheet.name,
          rowCount: used.rowCount,
          colCount: used.columnCount,
          address: used.address,
          approxBytes: bytes,
        });
      } catch (e) {
        // A sheet over the read ceiling throws here; record it and keep going.
        summaries.push({
          name: sheet.name,
          rowCount: 0,
          colCount: 0,
          address: '(read failed)',
          approxBytes: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { sheets: summaries, totalCells, approxBytes, syncCount, totalSyncMs: Math.round(totalSyncMs) };
  });
}

/** Probe D. Highlight an agent-named range (e.g. "A1:A20" or a column) and
 * select it, the gesture the authoring interview uses to point at a column. */
export async function highlightRange(address: string): Promise<void> {
  await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);
    range.format.fill.color = '#FFF3CD'; // the docs' attention yellow
    range.select();
    await ctx.sync();
  });
}

export async function clearHighlight(address: string): Promise<void> {
  await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    sheet.getRange(address).format.fill.clear();
    await ctx.sync();
  });
}

export interface ChangeEvent {
  atMs: number;
  address: string;
  changeType: string;
  source: string;
  triggerHint: string;
}

/** Probe E. Log worksheet onChanged events. The data-validation-dropdown case is
 * the one to watch: historically it does not fire onChanged on Excel-on-web. */
export async function startOnChangedLog(onEvent: (e: ChangeEvent) => void): Promise<() => Promise<void>> {
  const start = performance.now();
  const handler = await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    const h = sheet.onChanged.add(async (args) => {
      onEvent({
        atMs: Math.round(performance.now() - start),
        address: args.address,
        changeType: String(args.changeType),
        source: String(args.source),
        triggerHint: 'edit a cell, then a dropdown, then paste; compare which fire',
      });
    });
    await ctx.sync();
    return h;
  });

  return async () => {
    await Excel.run(handler.context, async (ctx) => {
      handler.remove();
      await ctx.sync();
    });
  };
}
