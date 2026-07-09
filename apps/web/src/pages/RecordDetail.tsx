import { Link, useParams } from 'react-router';
import { useContract, useRecordTimeline } from '../api/hooks';
import { objectFor, recordTitle } from '../contract-helpers';
import { Timeline } from '../components/Timeline';
import { Card, ErrorNote, PageHeader, SectionLabel, Spinner } from '../components/kit';
import { formatValue } from '@/lib/format';

export function RecordDetail() {
  const { workspaceId = '', recordId = '' } = useParams();
  const contract = useContract(workspaceId);
  const timeline = useRecordTimeline(workspaceId, recordId);

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

  return (
    <div>
      <Link
        to={`/w/${workspaceId}/records`}
        className="text-sm text-stone-400 hover:text-stone-600"
      >
        ← Records
      </Link>
      <PageHeader title={recordTitle(object, record.data)} sub={object?.label} />

      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <div>
          <SectionLabel>Fields</SectionLabel>
          <Card className="mt-2 p-4">
            <dl className="space-y-2.5">
              {(object?.fields ?? []).map((f) => (
                <div key={f.apiName} className="flex items-baseline gap-3">
                  <dt className="w-40 shrink-0 text-sm text-stone-500">{f.label}</dt>
                  <dd className="font-mono text-sm text-ink">
                    {formatValue(record.data[f.apiName])}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
        <div>
          <SectionLabel>Timeline</SectionLabel>
          <div className="mt-3">
            <Timeline entries={entries} />
          </div>
        </div>
      </div>
    </div>
  );
}
