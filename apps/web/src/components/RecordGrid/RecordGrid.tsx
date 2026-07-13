// The one place LyteNyte Grid is touched. Everything else in the app talks to this
// wrapper, so the grid library stays swappable (ADR-0014). Colors flow from the
// app's shadcn tokens via the ln-shadcn theme; grid-theme.css carries the type
// scale and Cormac's cell-state styling.
import '@1771technologies/lytenyte-core/design.css';
import '@1771technologies/lytenyte-core/shadcn.css';
import '@1771technologies/lytenyte-core/grid.css';
import './grid-theme.css';

import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Grid, useClientDataSource } from '@1771technologies/lytenyte-core';
import type { ContractField, ContractObject } from '@cormac/contract';
import { Badge } from '@/components/ui/badge';
import type { BusinessRecordRow } from '../../api/types';
import { formatValue, formatWhen } from '@/lib/format';
import { ValueDiff } from '../ValueDiff';
import { FieldEditor } from './editors';
import { orderedFields, gridColumnSize, gridColumnType } from './columns';

/** A pending agent proposal touching one cell: what it is now vs what it would become. */
export type CellOverlay = { current: unknown; proposed: unknown; op: 'create' | 'update' };
/** recordId (or ghost row id) -> field apiName -> the pending change on that cell. */
export type OverlayIndex = ReadonlyMap<string, ReadonlyMap<string, CellOverlay>>;
/** recordId -> field apiNames with a staged, unsaved edit. */
export type DirtyIndex = ReadonlyMap<string, ReadonlySet<string>>;

type Spec = Grid.GridSpec<BusinessRecordRow>;
type CellParams = Grid.T.CellRendererParams<Spec>;

function fieldValue(rec: BusinessRecordRow, apiName: string): unknown {
  return (rec.data as Record<string, unknown>)[apiName];
}

/** A cell that carries a pending change: a small amber dot beside the diff. */
function PendingCell({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
        title="Pending change — decide in the Cormac panel"
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
  dirty,
  titleById,
  editing,
  onRowEdited,
}: {
  workspaceId: string;
  object: ContractObject;
  rows: BusinessRecordRow[];
  overlay?: OverlayIndex;
  ghostIds?: ReadonlySet<string>;
  /** Cells with a staged edit awaiting Save; rendered with the dirty treatment. */
  dirty?: DirtyIndex;
  /** Record id -> human handle, so relationship cells show names, not ids. */
  titleById?: ReadonlyMap<string, string>;
  /** When true, editableByUser cells can be edited in place (staged, not written). */
  editing?: boolean;
  /** Fires with the full updated row when a cell edit commits (client-side staging). */
  onRowEdited?: (row: BusinessRecordRow) => void;
}) {
  const columns = useMemo<Grid.Column<Spec>[]>(() => {
    const fields = orderedFields(object);
    const identityApi = fields[0]?.apiName;

    const isCellEditable = (f: ContractField, rec: BusinessRecordRow | undefined): boolean => {
      if (!rec) return false;
      if (ghostIds?.has(rec.id)) return false; // ghost creates decide as a whole, not per-cell
      if (overlay?.get(rec.id)?.has(f.apiName)) return false; // resolve the pending change first
      return f.editableByUser && f.type !== 'relationship';
    };

    // State markers grid-theme.css hangs cursor/hover/tint styling on.
    const markers = (f: ContractField, rec: BusinessRecordRow): string => {
      const m: string[] = [];
      if (ghostIds?.has(rec.id)) m.push('cormac-ghost');
      else {
        if (editing && isCellEditable(f, rec)) m.push('cormac-editable');
        if (dirty?.get(rec.id)?.has(f.apiName)) m.push('cormac-dirty');
      }
      return m.join(' ');
    };

    const fieldColumns: Grid.Column<Spec>[] = fields.map((f, i) => ({
      id: f.apiName,
      name: f.label,
      type: gridColumnType(f.type),
      field: { kind: 'path', path: `data.${f.apiName}` },
      ...gridColumnSize(f, f.apiName === identityApi),
      editable: editing
        ? (p: Grid.T.CellParamsWithIndex<Spec>) => isCellEditable(f, p.row.data as BusinessRecordRow)
        : undefined,
      // Path fields need an explicit setter: LyteNyte's default write-back only
      // handles string fields and silently drops the edit otherwise.
      editSetter: ({ editData, editValue }) => {
        const row = editData as BusinessRecordRow;
        return { ...row, data: { ...row.data, [f.apiName]: editValue } };
      },
      editOnPrintable: f.type === 'enum' || f.type === 'boolean' ? false : undefined,
      editRenderer: (p: Grid.T.EditParams<Spec>) => (
        <FieldEditor
          field={f}
          editValue={p.editValue}
          changeValue={p.changeValue}
          commit={p.commit}
        />
      ),
      cellRenderer: (params: CellParams) => {
        const rec = params.row.data as BusinessRecordRow | undefined;
        if (!rec) return null;
        const ov = overlay?.get(rec.id)?.get(f.apiName);
        const value = fieldValue(rec, f.apiName);
        const text =
          f.type === 'relationship' && typeof value === 'string'
            ? (titleById?.get(value) ?? formatValue(value))
            : formatValue(value);

        // Identity column: name is the record's handle and its link.
        if (i === 0) {
          if (ghostIds?.has(rec.id)) {
            return (
              <span className="cormac-ghost flex min-w-0 items-center gap-1.5 overflow-hidden">
                <Badge variant="create">new</Badge>
                <span className="truncate font-medium text-ink" title={text}>
                  {text}
                </span>
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
            <span className={`${markers(f, rec)} block min-w-0`}>
              <Link
                to={`/w/${workspaceId}/records/${rec.id}`}
                className="block truncate font-medium text-ink hover:text-ledger-700 hover:underline hover:decoration-ledger-300 hover:underline-offset-2"
                title={text}
              >
                {text}
              </Link>
            </span>
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
        return (
          <span
            className={`${markers(f, rec)} block min-w-0 truncate text-stone-600`}
            title={text}
          >
            {text}
          </span>
        );
      },
    }));

    const updatedColumn: Grid.Column<Spec> = {
      id: '__updated',
      name: 'Updated',
      type: 'date',
      field: 'updated_at',
      width: 150,
      widthMin: 120,
      widthFlex: 0,
      cellRenderer: (params: CellParams) => {
        const rec = params.row.data as BusinessRecordRow | undefined;
        if (!rec || ghostIds?.has(rec.id))
          return <span className="cormac-ghost text-xs text-stone-300">—</span>;
        return <span className="text-xs text-stone-400">{formatWhen(rec.updated_at)}</span>;
      },
    };

    return [...fieldColumns, updatedColumn];
  }, [object, workspaceId, overlay, ghostIds, dirty, titleById, editing]);

  const columnBase = useMemo(() => ({ resizable: true }), []);

  const ds = useClientDataSource<BusinessRecordRow>({
    data: rows,
    onRowDataChange: onRowEdited
      ? ({ center }) => {
          for (const row of center.values()) onRowEdited(row);
        }
      : undefined,
  });

  return (
    <div className="ln-grid ln-shadcn h-full w-full">
      <Grid<Spec>
        columns={columns}
        columnBase={columnBase}
        rowSource={ds}
        rowHeight={44}
        editMode={editing ? 'cell' : 'readonly'}
      />
    </div>
  );
}
