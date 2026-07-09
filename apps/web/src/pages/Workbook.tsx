import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useWorkbookUpload } from '../api/hooks';
import { typeWord, WorkbookPreview } from '../components/WorkbookPreview';
import { Button, ErrorNote, PageHeader, SectionLabel } from '../components/kit';
import { detectSheet, toDetectionProfile } from '../workbook/detect';
import { parseWorkbookFile } from '../workbook/parse';
import { saveParsedWorkbook } from '../workbook/store';
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

export function Workbook() {
  const { workspaceId = '' } = useParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [jsonProfile, setJsonProfile] = useState<DetectionProfile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);
  const upload = useWorkbookUpload(workspaceId);

  async function onFile(file: File) {
    setParseError(null);
    setUploaded(false);
    setJsonProfile(null);
    setParsed(null);
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
        if (wb.sheets.length === 0) throw new Error('We could not find any filled-in sheets in that file');
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

  function submit() {
    const profile = jsonProfile ?? (parsed ? toDetectionProfile(parsed) : null);
    if (!profile) return;
    const name = slugify(profile.workbookName);
    upload.mutate(
      { name, profile },
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
    <div>
      <PageHeader
        title="Workbook"
        sub="Bring the spreadsheet your business lives in. Cormac reads a summary of its structure during the interview. The file itself never leaves your browser."
      />

      <div
        className="mb-6 cursor-pointer rounded-xl border-2 border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center transition-colors hover:border-ledger-400 hover:bg-ledger-50/40"
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
      >
        <div className="font-display text-xl text-stone-600">
          Drop your workbook here, or click to choose
        </div>
        <div className="mt-1 text-sm text-stone-400">
          Excel files (.xlsx){import.meta.env.DEV ? ' — or a .detected.json fixture in dev' : ''}
        </div>
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
          <SectionLabel>Check it looks right before sharing</SectionLabel>
          <div className="mt-2">
            <WorkbookPreview
              sheets={parsed.sheets}
              onHeaderRowChange={setHeaderRow}
              onActiveSheetChange={setActiveSheetName}
            />
          </div>

          {activeSheet && activeColumns.length > 0 && (
            <div className="mt-4">
              <SectionLabel>Columns we found in “{activeSheet.name}”</SectionLabel>
              <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-stone-600 sm:grid-cols-2">
                {activeColumns.map((c) => (
                  <li key={c.header} className="flex items-baseline justify-between gap-3 border-b border-stone-100 py-1">
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
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={submit} busy={upload.isPending}>
            Share with Cormac
          </Button>
          {uploaded && (
            <span className="text-sm text-ledger-700">
              Cormac has your workbook — ready for the{' '}
              <Link
                to={`/w/${workspaceId}/interview`}
                className="font-medium underline decoration-ledger-300 underline-offset-2 hover:decoration-ledger-600"
              >
                interview
              </Link>
              .
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
