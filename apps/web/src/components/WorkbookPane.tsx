import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useWorkbookUpload } from '../api/hooks';
import { typeWord, WorkbookPreview } from './WorkbookPreview';
import { ErrorNote, SectionLabel } from './kit';
import { detectSheet, toDetectionProfile } from '../workbook/detect';
import { parseWorkbookFile } from '../workbook/parse';
import { loadParsedWorkbook, saveParsedWorkbook } from '../workbook/store';
import type { DetectionProfile, ParsedWorkbook } from '../workbook/types';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^[^a-z0-9]/, 'w') || 'workbook'
  );
}

/**
 * The Book's left pane before the book is live: the client's workbook, from
 * upload through the interview. When Cormac mentions columns in the
 * conversation beside it, they highlight here. The file itself never leaves
 * the browser; only the structure summary is shared.
 */
export function WorkbookPane({ lastCormacText }: { lastCormacText?: string }) {
  const { workspaceId = '' } = useParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(() =>
    loadParsedWorkbook(workspaceId),
  );
  const [jsonProfile, setJsonProfile] = useState<DetectionProfile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);
  const upload = useWorkbookUpload(workspaceId);

  // Columns Cormac just mentioned in the conversation highlight in the preview.
  const highlights = useMemo(() => {
    const set = new Set<string>();
    if (!lastCormacText || !parsed) return set;
    const text = lastCormacText.toLowerCase();
    for (const sheet of parsed.sheets) {
      const headers = sheet.grid[sheet.headerRowIndex] ?? [];
      for (const h of headers) {
        const header = h.trim();
        if (header.length >= 3 && text.includes(header.toLowerCase())) {
          set.add(header.toLowerCase());
        }
      }
    }
    return set;
  }, [lastCormacText, parsed]);

  async function onFile(file: File) {
    setParseError(null);
    setUploaded(false);
    setJsonProfile(null);
    try {
      if (import.meta.env.DEV && file.name.endsWith('.json')) {
        // Dev-only convenience: a pre-built detection profile (the eval fixtures).
        const profile = JSON.parse(await file.text()) as DetectionProfile;
        if (!profile.workbookName || !Array.isArray(profile.sheets)) {
          throw new Error('That JSON is not a detection profile (workbookName/sheets missing)');
        }
        setJsonProfile(profile);
      } else {
        const wb = await parseWorkbookFile(file);
        if (wb.sheets.length === 0)
          throw new Error('We could not find any filled-in sheets in that file');
        setParsed(wb);
        setActiveSheetName(wb.sheets[0]?.name ?? null);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }

  function setHeaderRow(sheetName: string, headerRowIndex: number) {
    setParsed((prev) =>
      prev
        ? {
            ...prev,
            sheets: prev.sheets.map((s) => (s.name === sheetName ? { ...s, headerRowIndex } : s)),
          }
        : prev,
    );
  }

  function share() {
    const profile = jsonProfile ?? (parsed ? toDetectionProfile(parsed) : null);
    if (!profile) return;
    upload.mutate(
      { name: slugify(profile.workbookName), profile },
      {
        onSuccess: () => {
          setUploaded(true);
          if (parsed) saveParsedWorkbook(workspaceId, parsed);
        },
      },
    );
  }

  const ready = parsed ?? jsonProfile;
  const activeSheet =
    parsed?.sheets.find((s) => s.name === activeSheetName) ?? parsed?.sheets[0] ?? null;
  const activeColumns = activeSheet ? detectSheet(activeSheet).columns : [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-[560] text-ink">Your workbook</h1>
        <p className="mt-1 max-w-lg text-sm text-stone-500">
          The spreadsheet your business lives in. Cormac reads its structure while you talk, and
          turns it into your book. The file never leaves your browser.
        </p>
      </header>

      <div
        className={`mb-5 cursor-pointer rounded-xl border-2 border-dashed border-stone-300 bg-card/60 text-center transition-colors hover:border-ledger-400 hover:bg-ledger-50/40 ${
          parsed ? 'px-4 py-4' : 'px-4 py-10'
        }`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
      >
        <div className={`font-display text-stone-600 ${parsed ? 'text-sm' : 'text-xl'}`}>
          {parsed ? 'Drop a different workbook, or click to choose' : 'Drop your workbook here, or click to choose'}
        </div>
        {!parsed && (
          <div className="mt-1 text-sm text-stone-400">
            Excel files (.xlsx){import.meta.env.DEV ? ' — or a .detected.json fixture in dev' : ''}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={import.meta.env.DEV ? '.xlsx,.xls,.json' : '.xlsx,.xls'}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </div>

      {parseError && <ErrorNote error={new Error(parseError)} />}

      {parsed && (
        <section className="animate-rise">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <SectionLabel>Check it looks right</SectionLabel>
            {highlights.size > 0 && (
              <span className="text-xs text-muted-foreground">
                Cormac just mentioned {highlights.size} of your columns
              </span>
            )}
          </div>
          <div className="mt-2">
            <WorkbookPreview
              sheets={parsed.sheets}
              highlightHeaders={highlights}
              onHeaderRowChange={setHeaderRow}
              onActiveSheetChange={setActiveSheetName}
            />
          </div>

          {activeSheet && activeColumns.length > 0 && (
            <div className="mt-4">
              <SectionLabel>Columns we found in “{activeSheet.name}”</SectionLabel>
              <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-stone-600 sm:grid-cols-2">
                {activeColumns.map((c) => (
                  <li
                    key={c.header}
                    className="flex items-baseline justify-between gap-3 border-b border-stone-100 py-1"
                  >
                    <span className="font-medium text-ink">{c.header}</span>
                    <span className="text-sm text-stone-400">{typeWord(c.inferredType)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {jsonProfile && import.meta.env.DEV && (
        <div className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          Detection profile <span className="font-mono">{jsonProfile.workbookName}</span> with{' '}
          {jsonProfile.sheets.length} sheet(s), ready to send.
        </div>
      )}

      {ready && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={share} busy={upload.isPending}>
            Share with Cormac
          </Button>
          {uploaded && (
            <span className="text-sm text-ledger-700">
              Cormac has it — say hello in the conversation and set up your book.
            </span>
          )}
        </div>
      )}
      {upload.error && (
        <div className="mt-3">
          <ErrorNote error={upload.error} />
        </div>
      )}
    </div>
  );
}
