import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useWorkbookUpload } from '../api/hooks';
import { WorkbookPreview } from '../components/WorkbookPreview';
import { Button, ErrorNote, PageHeader, SectionLabel } from '../components/ui';
import { toDetectionProfile } from '../workbook/detect';
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
  const [uploadedAs, setUploadedAs] = useState<string | null>(null);
  const upload = useWorkbookUpload(workspaceId);

  async function onFile(file: File) {
    setParseError(null);
    setUploadedAs(null);
    setJsonProfile(null);
    setParsed(null);
    try {
      if (file.name.endsWith('.json')) {
        // Dev convenience: a pre-built detection profile (the eval fixtures).
        const profile = JSON.parse(await file.text()) as DetectionProfile;
        if (!profile.workbookName || !Array.isArray(profile.sheets)) {
          throw new Error('That JSON is not a detection profile (workbookName/sheets missing)');
        }
        setJsonProfile(profile);
      } else {
        const wb = await parseWorkbookFile(file);
        if (wb.sheets.length === 0) throw new Error('No non-empty sheets found in that file');
        setParsed(wb);
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
        onSuccess: (result) => {
          setUploadedAs(result.name);
          if (parsed) saveParsedWorkbook(workspaceId, parsed);
        },
      },
    );
  }

  const ready = parsed ?? jsonProfile;

  return (
    <div>
      <PageHeader
        title="Workbook"
        sub="Bring the spreadsheet your business lives in. Cormac reads a detection profile of it during the interview; the file itself never leaves this browser."
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
        <div className="font-display text-lg text-stone-600">
          Drop your workbook here, or click to choose
        </div>
        <div className="mt-1 text-xs text-stone-400">.xlsx (or a .detected.json fixture in dev)</div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.json"
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
          <SectionLabel>Preview — check the header rows before sending</SectionLabel>
          <div className="mt-2">
            <WorkbookPreview sheets={parsed.sheets} onHeaderRowChange={setHeaderRow} />
          </div>
        </section>
      )}

      {jsonProfile && (
        <div className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          Detection profile <span className="font-mono">{jsonProfile.workbookName}</span> with{' '}
          {jsonProfile.sheets.length} sheet(s), ready to send.
        </div>
      )}

      {ready && (
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={submit} busy={upload.isPending}>
            Send profile to Cormac
          </Button>
          {uploadedAs && (
            <span className="text-sm text-ledger-700">
              Stored as <span className="font-mono">{uploadedAs}</span> — ready for the{' '}
              <Link to={`/w/${workspaceId}/interview`} className="underline underline-offset-2">
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
