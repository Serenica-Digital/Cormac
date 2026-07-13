import { Fragment } from 'react';
import { Link, useParams } from 'react-router';
import type { Contract, ContractObject } from '@cormac/contract';
import { Card } from '@/components/ui/card';
import { useContract, useRecords, useRecordTimeline } from '../api/hooks';
import type { BusinessRecordRow } from '../api/types';
import { objectFor, recordTitle } from '../contract-helpers';
import { asDay, dayOf, daysBetween, dayWord } from '../lib/attention';
import { useRecordTitles } from '../lib/titles';
import { Timeline } from '../components/Timeline';
import { ErrorNote, PageHeader, SectionLabel, Spinner } from '../components/kit';
import { formatValue } from '@/lib/format';

export function RecordDetail() {
  const { workspaceId = '', recordId = '' } = useParams();
  const contract = useContract(workspaceId);
  const timeline = useRecordTimeline(workspaceId, recordId);
  const allRecords = useRecords(workspaceId);
  const titleById = useRecordTitles(workspaceId, contract.data?.contract);

  if (timeline.isPending) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Spinner />
      </div>
    );
  }
  if (timeline.error) return <ErrorNote error={timeline.error} />;

  const { record, entries } = timeline.data!;
  const object = objectFor(contract.data?.contract, record.object_api_name);
  const linked = linkedRecords(record, object, allRecords.data ?? [], contract.data?.contract);

  return (
    <div>
      <Link
        to={`/w/${workspaceId}/records`}
        className="text-sm text-stone-400 hover:text-stone-600"
      >
        ← Your book
      </Link>
      <PageHeader title={recordTitle(object, record.data)} sub={object?.label} />
      <BriefingLine
        record={record}
        object={object}
        workspaceId={workspaceId}
        titleFor={(id) => titleById.get(id)}
      />

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div>
            <SectionLabel>Fields</SectionLabel>
            <Card className="mt-2 gap-0 p-4">
              <dl className="space-y-2.5">
                {(object?.fields ?? []).map((f) => (
                  <div
                    key={f.apiName}
                    className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <dt className="shrink-0 text-sm text-stone-500 sm:w-40">{f.label}</dt>
                    <dd className="font-mono text-sm break-words text-ink">
                      {f.type === 'relationship' && typeof record.data[f.apiName] === 'string'
                        ? (titleById.get(record.data[f.apiName] as string) ??
                          formatValue(record.data[f.apiName]))
                        : formatValue(record.data[f.apiName])}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          {linked.length > 0 && (
            <div>
              <SectionLabel>Linked records</SectionLabel>
              <Card className="mt-2 gap-0 p-2">
                <ul>
                  {linked.map(({ row, label }) => (
                    <li key={row.id}>
                      <Link
                        to={`/w/${workspaceId}/records/${row.id}`}
                        className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-stone-50"
                      >
                        <span className="truncate font-medium text-ink">
                          {titleById.get(row.id) ?? '(record)'}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-stone-400">{label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </div>
        <div>
          <SectionLabel>Timeline</SectionLabel>
          <div className="mt-3">
            <Timeline entries={entries} object={object} titleFor={(id) => titleById.get(id)} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The pre-call line: status, rhythm (from the contract's semantic tags), and
 * who this record is linked to, in one readable sentence.
 */
function BriefingLine({
  record,
  object,
  workspaceId,
  titleFor,
}: {
  record: BusinessRecordRow;
  object: ContractObject | undefined;
  workspaceId: string;
  titleFor: (id: string) => string | undefined;
}) {
  if (!object) return null;
  const today = dayOf(new Date());
  const parts: React.ReactNode[] = [];

  const status = object.fields.find(
    (f) => f.type === 'enum' && typeof record.data[f.apiName] === 'string',
  );
  if (status) parts.push(formatValue(record.data[status.apiName]));

  const lastTouchField = object.fields.find((f) => f.semantic === 'last_touch');
  const lastTouch = lastTouchField ? asDay(record.data[lastTouchField.apiName]) : null;
  if (lastTouch) {
    const ago = -daysBetween(today, lastTouch);
    parts.push(
      ago <= 0
        ? 'touched today'
        : ago === 1
          ? 'last touched yesterday'
          : `last touched ${ago} days ago`,
    );
  }

  const followUpField = object.fields.find((f) => f.semantic === 'follow_up');
  const followUp = followUpField ? asDay(record.data[followUpField.apiName]) : null;
  if (followUp) {
    const overdue = daysBetween(today, followUp) < 0;
    parts.push(`follow-up ${overdue ? 'was due' : 'due'} ${dayWord(followUp, today)}`);
  }

  for (const f of object.fields) {
    const v = record.data[f.apiName];
    if (f.type === 'relationship' && typeof v === 'string' && titleFor(v)) {
      parts.push(
        <Fragment key={f.apiName}>
          linked to{' '}
          <Link
            to={`/w/${workspaceId}/records/${v}`}
            className="font-medium text-ink underline decoration-stone-300 underline-offset-2 hover:decoration-ink"
          >
            {titleFor(v)}
          </Link>
        </Fragment>,
      );
    }
  }

  if (parts.length === 0) return null;
  return (
    <p className="mt-1 text-sm text-stone-600">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="mx-1.5 text-stone-300">·</span>}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

/** Every record pointing at this one through a relationship field ("People here"). */
function linkedRecords(
  record: BusinessRecordRow,
  object: ContractObject | undefined,
  all: BusinessRecordRow[],
  contract: Contract | undefined,
): Array<{ row: BusinessRecordRow; label: string }> {
  if (!object || !contract) return [];
  const out: Array<{ row: BusinessRecordRow; label: string }> = [];
  for (const row of all) {
    if (row.id === record.id || row.archived_at) continue;
    const rowObject = objectFor(contract, row.object_api_name);
    if (!rowObject) continue;
    const points = rowObject.fields.some(
      (f) =>
        f.type === 'relationship' &&
        f.relationshipTargetType === object.apiName &&
        row.data[f.apiName] === record.id,
    );
    if (points) out.push({ row, label: rowObject.label });
  }
  return out;
}
