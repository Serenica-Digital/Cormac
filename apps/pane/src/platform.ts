import type { Platform } from './auth/lanes';

/**
 * Which Office platform the pane is running on. Drives which auth lanes are
 * offered (NAA is Windows/Mac, the Mac WKWebView abort is the known Lane A risk)
 * and labels every probe readout so the GO/NO-GO results table is per-platform.
 */
export function detectPlatform(): Platform {
  try {
    const p = Office.context?.platform;
    if (p === Office.PlatformType.PC) return 'windows';
    if (p === Office.PlatformType.Mac) return 'mac';
    if (p === Office.PlatformType.OfficeOnline) return 'web';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function platformLabel(p: Platform): string {
  switch (p) {
    case 'windows':
      return 'Windows (WebView2)';
    case 'mac':
      return 'Mac (WKWebView)';
    case 'web':
      return 'Excel on the web';
    default:
      return 'Unknown / not in Excel';
  }
}
