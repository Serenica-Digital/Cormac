/**
 * Office.js readiness gate. office.js loads from the CDN (see index.html) and
 * resolves onReady when the host is up. In a plain browser (dev without Excel)
 * it still resolves, so the app renders and the workbook probes degrade to a
 * clear error instead of a blank pane.
 */
export interface OfficeReadyInfo {
  host: Office.HostType | null;
  platform: Office.PlatformType | null;
}

let readyPromise: Promise<OfficeReadyInfo> | null = null;

export function officeReady(): Promise<OfficeReadyInfo> {
  if (!readyPromise) {
    readyPromise =
      typeof Office !== 'undefined' && typeof Office.onReady === 'function'
        ? Office.onReady()
        : Promise.resolve({ host: null, platform: null });
  }
  return readyPromise;
}

export function inExcel(): boolean {
  try {
    return typeof Office !== 'undefined' && Office.context?.host === Office.HostType.Excel;
  } catch {
    return false;
  }
}
