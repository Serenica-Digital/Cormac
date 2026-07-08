import { useParams } from 'react-router';
import { useContract } from '../api/hooks';
import { Card, Chip, EmptyState, PageHeader, SectionLabel, Spinner } from '../components/ui';

export function ContractPage() {
  const { workspaceId = '' } = useParams();
  const contract = useContract(workspaceId);

  if (contract.isPending) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Spinner />
      </div>
    );
  }
  if (contract.error || !contract.data) {
    return (
      <div>
        <PageHeader title="Contract" />
        <EmptyState
          title="Nothing published yet"
          hint="The interview ends by publishing your first contract version."
        />
      </div>
    );
  }

  const { contract: doc, version } = contract.data;

  return (
    <div>
      <PageHeader
        title={doc.name}
        sub={`Version ${version}, live. This is the shared source of truth every capture is validated against.`}
      />

      <div className="space-y-6">
        {doc.objects.map((o) => (
          <Card key={o.apiName} className="animate-rise p-5">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-lg font-[560] text-ink">{o.label}</h2>
              <span className="font-mono text-xs text-stone-400">{o.apiName}</span>
              <span className="ml-auto text-xs text-stone-400">
                identified by {o.identity.displayFields.join(', ')}
              </span>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-400">
                  <th className="py-1.5 pr-4 font-medium">Field</th>
                  <th className="py-1.5 pr-4 font-medium">Type</th>
                  <th className="py-1.5 pr-4 font-medium">Rules</th>
                </tr>
              </thead>
              <tbody>
                {o.fields.map((f) => (
                  <tr key={f.apiName} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-medium text-ink">{f.label}</span>
                      <span className="ml-2 font-mono text-xs text-stone-400">{f.apiName}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <Chip tone="neutral">
                        {f.type}
                        {f.type === 'relationship' && f.relationshipTargetType
                          ? ` → ${f.relationshipTargetType}`
                          : ''}
                      </Chip>
                      {f.type === 'enum' && f.enumOptions && (
                        <span className="ml-2 text-xs text-stone-400">
                          {f.enumOptions.join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-stone-500">
                      {[
                        f.required ? 'required' : null,
                        f.editableByAgent ? 'agent may propose' : 'human-only',
                        f.sensitive ? 'sensitive' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}

        {doc.glossary.length > 0 && (
          <div>
            <SectionLabel>Glossary</SectionLabel>
            <Card className="mt-2 divide-y divide-stone-100 p-0">
              {doc.glossary.map((g) => (
                <div key={g.entryId} className="px-5 py-3">
                  <div className="text-sm font-medium text-ink">{g.term}</div>
                  <div className="mt-0.5 text-sm text-stone-600">{g.definition}</div>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
