// The one place LyteNyte Grid is touched. Everything else in the app talks to this
// wrapper, so the grid library stays swappable (ADR-0014). The shadcn theme reads the
// app's own --background/--foreground tokens, so light/dark follow the app automatically.
import '@1771technologies/lytenyte-core/design.css';
import '@1771technologies/lytenyte-core/shadcn.css';
import '@1771technologies/lytenyte-core/grid.css';

import { useMemo } from 'react';
import { Link } from 'react-router';
import { Grid, useClientDataSource } from '@1771technologies/lytenyte-core';
import type { ContractObject } from '@cormac/contract';
import type { BusinessRecordRow } from '../../api/types';
import { formatValue, formatWhen } from '@/lib/format';
import { orderedFields, gridColumnType } from './columns';

type Spec = Grid.GridSpec<BusinessRecordRow>;
type CellParams = Grid.T.CellRendererParams<Spec>;

function recordOf(params: CellParams): BusinessRecordRow | undefined {
  return params.row.data as BusinessRecordRow | undefined;
}

function fieldValue(rec: BusinessRecordRow, apiName: string): unknown {
  return (rec.data as Record<string, unknown>)[apiName];
}

export function RecordGrid({
  workspaceId,
  object,
  rows,
}: {
  workspaceId: string;
  object: ContractObject;
  rows: BusinessRecordRow[];
}) {
  const columns = useMemo<Grid.Column<Spec>[]>(() => {
    const fields = orderedFields(object);

    const fieldColumns: Grid.Column<Spec>[] = fields.map((f, i) => ({
      id: f.apiName,
      name: f.label,
      type: gridColumnType(f.type),
      field: { kind: 'path', path: `data.${f.apiName}` },
      width: i === 0 ? 240 : 180,
      cellRenderer:
        i === 0
          ? (params: CellParams) => {
              const rec = recordOf(params);
              if (!rec) return null;
              return (
                <Link
                  to={`/w/${workspaceId}/records/${rec.id}`}
                  className="font-medium text-ledger-700 underline decoration-ledger-200 underline-offset-2 hover:decoration-ledger-600"
                >
                  {formatValue(fieldValue(rec, f.apiName))}
                </Link>
              );
            }
          : (params: CellParams) => {
              const rec = recordOf(params);
              return (
                <span className="text-stone-600">
                  {rec ? formatValue(fieldValue(rec, f.apiName)) : ''}
                </span>
              );
            },
    }));

    const updatedColumn: Grid.Column<Spec> = {
      id: '__updated',
      name: 'Updated',
      type: 'date',
      field: 'updated_at',
      width: 160,
      cellRenderer: (params: CellParams) => {
        const rec = recordOf(params);
        return (
          <span className="text-sm text-stone-400">{rec ? formatWhen(rec.updated_at) : ''}</span>
        );
      },
    };

    return [...fieldColumns, updatedColumn];
  }, [object, workspaceId]);

  const columnBase = useMemo(() => ({ resizable: true }), []);

  const ds = useClientDataSource<BusinessRecordRow>({ data: rows });

  return (
    <div className="ln-grid ln-shadcn h-full w-full">
      <Grid<Spec> columns={columns} columnBase={columnBase} rowSource={ds} rowHeight={44} />
    </div>
  );
}
