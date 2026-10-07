/**
 * Seam for a future malware/content scanner. ScoutX does not currently scan uploads for
 * malware; the noop scanner records `not_scanned` so no surface can claim otherwise.
 */
export type ScanResult = {
  status: 'not_scanned' | 'clean' | 'flagged';
  engine: string;
  checkedAt: string;
};

export interface MediaScanner {
  readonly engine: string;
  scan(storagePath: string): Promise<ScanResult>;
}

export const noopMediaScanner: MediaScanner = {
  engine: 'none',
  scan: async () => ({ status: 'not_scanned', engine: 'none', checkedAt: new Date().toISOString() }),
};

let activeScanner: MediaScanner = noopMediaScanner;

export function getMediaScanner(): MediaScanner {
  return activeScanner;
}

/** Test hook and future wiring point for a real scanner. */
export function setMediaScanner(scanner: MediaScanner): void {
  activeScanner = scanner;
}
