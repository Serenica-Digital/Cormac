import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCommitRecords, useContract } from '../api/hooks';
import { useCan } from '../lib/authz';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
import { parseWorkbookFile } from '../workbook/parse';
import { loadParsedWorkbook, saveParsedWorkbook } from '../workbook/store';
import { autoMap, buildCreateChanges, chunk, sheetColumns, type Mapping } from '../workbook/mapImport';
import type { ParsedWorkbook } from '../workbook/types';
import { formatValue } from '@/lib/format';

export function ImportWorkbook() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);
  const commit = useCommitRecords(workspaceId);
  const canEdit = useCan(workspaceId)('edit_records');

  const objects = contract.data?.contract.objects ?? [];
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(() => loadParsedWorkbook(workspaceId));
  const [sheetIndex, setSheetIndex] = useState(0);
  const [activeObject, setActiveObject] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; failed: number; errors: string[] } | null>(
    null,
  );

  const objectApiName = activeObject ?? objects[0]?.apiName;
  const object = objects.find((o) => o.apiName === objectApiName);
  const sheet = parsed?.sheets[sheetIndex];
  const columns = useMemo(() => (sheet ? sheetColumns(sheet) : []), [sheet]);

  // Re-run the auto-map whenever the target object or sheet changes.
  useEffect(() => {
    if (object && columns.length) setMapping(autoMap(object, columns));
  }, [object?.apiName, sheetIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const build = useMemo(
    () => (object && sheet ? buildCreateChanges(object, sheet, mapping) : { changes: [], skipped: 0 }),
    [object, sheet, mapping],
  );

  const mappedFields = object?.fields.filter((f) => f.editableByUser && mapping[f.apiName] != null) ?? [];

  const onFile = async (file: File) => {
    const wb = await parseWorkbookFile(file);
    saveParsedWorkbook(workspaceId, wb);
    setParsed(wb);
    setSheetIndex(0);
    setResult(null);
  };

  const runImport = async () => {
    if (!object || !sheet) return;
    const { changes, skipped } = build;
    if (changes.length === 0) return;
    const batches = chunk(changes, 200);
    setRunning(true);
    setResult(null);
    let created = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const batch of batches) {
      try {
        const res = await commit.mutateAsync({
          changes: batch,
          channel: 'excel',
          note: `Imported from ${parsed?.workbookName ?? 'workbook'} (${object.label})`,
        });
        created += res.applied.length;
      } catch (e) {
        failed += batch.length;
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    setRunning(false);
    setResult({ created, skipped, failed, errors });
  };

  if (contract.isPending) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Spinner />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <PageHeader title="Import" />
        <EmptyState title="Import needs edit access" hint="Ask an owner or manager to import your rows." />
      </div>
    );
  }

  if (contract.error || objects.length === 0) {
    return (
      <div>
        <PageHeader title="Import" />
        <EmptyState
          title="Set up your book first"
          hint="Import fills your book against its structure, so the interview comes first."
          action={
            <Button asChild variant="outline">
              <Link to={`/w/${workspaceId}/start`}>Get started</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const selectCls =
    'rounded-md border border-stone-200 bg-card px-2 py-1 text-sm text-ink outline-none focus:border-ledger-400';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import your rows"
        sub="Bring the rows from your spreadsheet into your book. Only the columns you map are sent; the file stays on your device."
      />

      {/* 1. Workbook source */}
      <Card className="gap-3 p-4">
        <h2 className="text-sm font-semibold text-ink">Your workbook</h2>
        {parsed ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-ink">{parsed.workbookName}</span>
            {parsed.sheets.length > 1 && (
              <select
                className={selectCls}
                value={sheetIndex}
                onChange={(e) => setSheetIndex(Number(e.target.value))}
              >
                {parsed.sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <span className="text-stone-400">
              {sheet ? `${Math.max(sheet.grid.length - sheet.headerRowIndex - 1, 0)} rows` : ''}
            </span>
            <label className="ml-auto cursor-pointer text-ledger-700 underline decoration-ledger-200 hover:decoration-ledger-600">
              Choose a different file
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
              />
            </label>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-stone-300 py-8 text-sm text-stone-500 hover:border-ledger-400">
            <span>Upload your .xlsx workbook</span>
            <span className="text-xs text-stone-400">It is parsed in your browser; the file never leaves your device.</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
            />
          </label>
        )}
      </Card>

      {parsed && sheet && object && (
        <>
          {/* 2. Target object */}
          <Card className="gap-3 p-4">
            <h2 className="text-sm font-semibold text-ink">Import into</h2>
            <div className="flex flex-wrap gap-1">
              {objects.map((o) => (
                <button
                  key={o.apiName}
                  onClick={() => setActiveObject(o.apiName)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    o.apiName === objectApiName ? 'bg-ink text-paper' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Card>

          {/* 3. Column mapping */}
          <Card className="gap-2 p-4">
            <h2 className="text-sm font-semibold text-ink">Match columns to fields</h2>
            <p className="text-xs text-stone-400">
              Cormac guessed these from your headers. Adjust any that are off.
            </p>
            <div className="mt-1 divide-y divide-stone-100">
              {object.fields.map((f) => (
                <div key={f.apiName} className="flex items-center gap-3 py-2">
                  <div className="w-52 shrink-0 text-sm">
                    <span className="font-medium text-ink">{f.label}</span>
                    {f.required && <span className="text-red-500"> *</span>}
                    <span className="ml-1.5 text-xs text-stone-400">{f.type}</span>
                  </div>
                  <select
                    className={selectCls}
                    disabled={!f.editableByUser}
                    value={mapping[f.apiName] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [f.apiName]: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">{f.editableByUser ? '(skip)' : '(managed by Cormac)'}</option>
                    {columns.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>

          {/* 4. Preview + import */}
          <Card className="gap-3 p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold text-ink">Preview</h2>
              <span className="text-xs text-stone-400">
                {build.changes.length} rows ready
                {build.skipped > 0 ? ` · ${build.skipped} skipped (missing a required field)` : ''}
              </span>
            </div>

            {mappedFields.length > 0 && build.changes.length > 0 ? (
              <div className="overflow-x-auto rounded-md ring-1 ring-stone-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-stone-50/70 text-left text-xs text-stone-500">
                      {mappedFields.map((f) => (
                        <th key={f.apiName} className="px-3 py-2 font-semibold">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {build.changes.slice(0, 5).map((ch, i) => (
                      <tr key={i} className="border-t border-stone-100">
                        {mappedFields.map((f) => (
                          <td key={f.apiName} className="px-3 py-1.5 text-stone-600">
                            {formatValue(ch.values[f.apiName])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-stone-500">
                Map at least one column with data to preview the import.
              </p>
            )}

            {commit.error && <ErrorNote error={commit.error} />}

            {result ? (
              <div className="rounded-md border border-ledger-200 bg-ledger-50/60 p-3 text-sm">
                <p className="font-medium text-ink">
                  Imported {result.created} record{result.created === 1 ? '' : 's'}.
                </p>
                {result.skipped > 0 && (
                  <p className="text-stone-500">{result.skipped} skipped (missing a required field).</p>
                )}
                {result.failed > 0 && (
                  <p className="text-red-600">
                    {result.failed} failed. {result.errors[0]}
                  </p>
                )}
                <Button asChild variant="outline" className="mt-2">
                  <Link to={`/w/${workspaceId}/records`}>Open your records</Link>
                </Button>
              </div>
            ) : (
              <div>
                <Button onClick={runImport} busy={running} disabled={build.changes.length === 0}>
                  Import {build.changes.length} record{build.changes.length === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
