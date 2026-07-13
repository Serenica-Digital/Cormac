import type { ContractField } from '@cormac/contract';

/**
 * A cell editor for a contract field, keyed off its type. Native inputs keep it
 * dependency-free and reliable inside the grid; empty/invalid entries fall back
 * to the current value rather than emitting a null the contract would reject.
 * LyteNyte hands us `editValue` and `changeValue`; the grid commits on Enter/blur
 * (for selects we commit on change so the pick lands immediately).
 */
export function FieldEditor({
  field,
  editValue,
  changeValue,
  commit,
}: {
  field: ContractField;
  editValue: unknown;
  changeValue: (v: unknown) => void;
  commit: () => void;
}) {
  // px-2.5 mirrors the grid's 10px cell padding (--ln-padding-horizontal-cell)
  // and text-sm its 15px type, so entering edit does not shift the text.
  const cls = 'h-full w-full bg-transparent px-2.5 text-sm outline-none focus:bg-ledger-50/60';

  switch (field.type) {
    case 'enum':
      return (
        <select
          className={cls}
          defaultValue={editValue == null ? '' : String(editValue)}
          onChange={(e) => {
            if (e.target.value !== '') changeValue(e.target.value);
            commit();
          }}
        >
          <option value="">—</option>
          {(field.enumOptions ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );

    case 'boolean':
      return (
        <select
          className={cls}
          defaultValue={editValue === true ? 'true' : editValue === false ? 'false' : ''}
          onChange={(e) => {
            if (e.target.value !== '') changeValue(e.target.value === 'true');
            commit();
          }}
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );

    case 'number':
      return (
        <input
          type="number"
          className={`${cls} text-right tabular-nums`}
          defaultValue={typeof editValue === 'number' ? editValue : ''}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (!Number.isNaN(n)) changeValue(n);
          }}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          className={cls}
          defaultValue={typeof editValue === 'string' ? editValue : ''}
          onChange={(e) => {
            if (e.target.value) changeValue(e.target.value);
          }}
        />
      );

    default:
      return (
        <input
          type="text"
          className={cls}
          defaultValue={editValue == null ? '' : String(editValue)}
          onChange={(e) => changeValue(e.target.value)}
        />
      );
  }
}
