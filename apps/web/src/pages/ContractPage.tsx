import { useParams } from 'react-router';
import { useContract } from '../api/hooks';
import { Card, Chip, EmptyState, PageHeader, SectionLabel, Spinner } from '../components/kit';

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
        <PageHeader title="Structure" />
        <EmptyState
          title="Nothing here yet"
          hint="The interview ends by setting up how your book is organized — that's what shows here."
        />
      </div>
    );
  }

  const { contract: doc, version } = contract.data;

  return (
    <div>
      <PageHeader
        title={doc.name}
        sub={`Structure, version ${version} — how Cormac understands your book. Every change it proposes is checked against this.`}
      />

      <div className="space-y-6">
        {doc.objects.map((o) => (
          <Card key={o.apiName} className="animate-rise p-5">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-xl font-[560] text-ink">{o.label}</h2>
              <span className="ml-auto text-sm text-stone-400">
                identified by {o.identity.displayFields.join(', ')}
              </span>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-stone-400">
                  <th className="py-2 pr-4 font-medium">Field</th>
                  <th className="py-2 pr-4 font-medium">Kind</th>
                  <th className="py-2 pr-4 font-medium">Rules</th>
                </tr>
              </thead>
              <tbody>
                {o.fields.map((f) => (
                  <tr key={f.apiName} className="border-b border-stone-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-ink">{f.label}</td>
                    <td className="py-2.5 pr-4">
                      <Chip tone="neutral">
                        {f.type === 'string'
                          ? 'text'
                          : f.type === 'boolean'
                            ? 'yes/no'
                            : f.type === 'enum'
                              ? 'choice'
                              : f.type === 'relationship'
                                ? 'linked record'
                                : f.type}
                      </Chip>
                      {f.type === 'enum' && f.enumOptions && (
                        <span className="ml-2 text-sm text-stone-400">
                          {f.enumOptions.join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-stone-500">
                      {[
                        f.required ? 'required' : null,
                        f.editableByAgent ? 'Cormac may propose changes' : 'only you can change it',
                        f.sensitive ? 'kept private from Cormac' : null,
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
