// The one place LyteNyte Grid is touched. Everything else in the app talks to this
// wrapper, so the grid library stays swappable (ADR-0014). The shadcn theme reads the
// app's own --background/--foreground tokens, so light/dark follow the app automatically.
import '@1771technologies/lytenyte-core/design.css';
import '@1771technologies/lytenyte-core/shadcn.css';
import '@1771technologies/lytenyte-core/grid.css';

import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Grid, useClientDataSource } from '@1771technologies/lytenyte-core';
import type { ContractObject } from '@cormac/contract';
import { Badge } from '@/components/ui/badge';
import type { BusinessRecordRow } from '../../api/types';
import { formatValue, formatWhen } from '@/lib/format';
import { ValueDiff } from '../ValueDiff';
import { orderedFields, gridColumnType } from './columns';

/** A pending agent proposal touching one cell: what it is now vs what it would become. */
export type CellOverlay = { current: unknown; proposed: unknown; op: 'create' | 'update' };
/** recordId (or ghost row id) -> field apiName -> the pending change on that cell. */
export type OverlayIndex = ReadonlyMap<string, ReadonlyMap<string, CellOverlay>>;

type Spec = Grid.GridSpec<BusinessRecordRow>;
type CellParams = Grid.T.CellRendererParams<Spec>;

function recordOf(params: CellParams): BusinessRecordRow | undefined {
  return params.row.data as BusinessRecordRow | undefined;
}

function fieldValue(rec: BusinessRecordRow, apiName: string): unknown {
  return (rec.data as Record<string, unknown>)[apiName];
}

/** A cell that carries a pending change: a small amber dot beside the diff. */
function PendingCell({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
        title="Pending change — confirm it below"
      />
      {children}
    </span>
  );
}

export function RecordGrid({
  workspaceId,
  object,
  rows,
  overlay,
  ghostIds,
}: {
  workspaceId: string;
  object: ContractObject;
  rows: BusinessRecordRow[];
  overlay?: OverlayIndex;
  ghostIds?: ReadonlySet<string>;
}) {
  const columns = useMemo<Grid.Column<Spec>[]>(() => {
    const fields = orderedFields(object);

    const fieldColumns: Grid.Column<Spec>[] = fields.map((f, i) => ({
      id: f.apiName,
      name: f.label,
      type: gridColumnType(f.type),
      field: { kind: 'path', path: `data.${f.apiName}` },
      width: i === 0 ? 240 : 180,
      cellRenderer: (params: CellParams) => {
        const rec = recordOf(params);
        if (!rec) return null;
        const ov = overlay?.get(rec.id)?.get(f.apiName);
        const value = fieldValue(rec, f.apiName);

        // Identity column: name is the record's handle and its link.
        if (i === 0) {
          if (ghostIds?.has(rec.id)) {
            return (
              <span className="flex items-center gap-1.5">
                <Badge variant="create">new</Badge>
                <span className="font-medium text-ink">{formatValue(value)}</span>
              </span>
            );
          }
          if (ov) {
            return (
              <PendingCell>
                <ValueDiff current={ov.current} proposed={ov.proposed} />
              </PendingCell>
            );
          }
          return (
            <Link
              to={`/w/${workspaceId}/records/${rec.id}`}
              className="font-medium text-ledger-700 underline decoration-ledger-200 underline-offset-2 hover:decoration-ledger-600"
            >
              {formatValue(value)}
            </Link>
          );
        }

        // Other columns: plain value, or a pending diff when a proposal touches it.
        if (ov) {
          return (
            <PendingCell>
              <ValueDiff current={ov.current} proposed={ov.proposed} />
            </PendingCell>
          );
        }
        return <span className="text-stone-600">{formatValue(value)}</span>;
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
        if (!rec || ghostIds?.has(rec.id)) return <span className="text-sm text-stone-300">—</span>;
        return <span className="text-sm text-stone-400">{formatWhen(rec.updated_at)}</span>;
      },
    };

    return [...fieldColumns, updatedColumn];
  }, [object, workspaceId, overlay, ghostIds]);

  const columnBase = useMemo(() => ({ resizable: true }), []);

  const ds = useClientDataSource<BusinessRecordRow>({ data: rows });

  return (
    <div className="ln-grid ln-shadcn h-full w-full">
      <Grid<Spec> columns={columns} columnBase={columnBase} rowSource={ds} rowHeight={44} />
    </div>
  );
}
