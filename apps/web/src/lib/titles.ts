import { useMemo } from 'react';
import type { Contract } from '@cormac/contract';
import { useRecords } from '../api/hooks';
import { recordTitle } from '../contract-helpers';

/**
 * id -> human handle for every record in the book, so relationship values
 * render as names, never as raw record ids. Rides the all-records query
 * (cache-shared across the Book and the Cormac panel).
 */
export function useRecordTitles(
  workspaceId: string,
  contract?: Contract,
): ReadonlyMap<string, string> {
  const all = useRecords(workspaceId);
  return useMemo(() => {
    const byApi = new Map(contract?.objects.map((o) => [o.apiName, o] as const) ?? []);
    const titles = new Map<string, string>();
    for (const r of all.data ?? []) {
      const object = byApi.get(r.object_api_name);
      if (object) titles.set(r.id, recordTitle(object, r.data));
    }
    return titles;
  }, [all.data, contract]);
}
