import { GPS_TRACKING_CONFIG } from '@/features/gps/constants';
import type { GpsImportPreview } from '@/features/gps/services/gpsImportService';

export type GpsImportStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function keyFor(ownerId: string): string {
  if (!ownerId.trim()) throw new Error('owner');
  return `gps/local-import/${encodeURIComponent(ownerId)}`;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
  return value as Record<string, unknown>;
}
function number(value: unknown, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw new Error('invalid');
  return value;
}
function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid');
  return value;
}
function date(value: unknown): string {
  const result = string(value, 30);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error('invalid');
  return result;
}

/** Rebuild every persisted field. Unknown fields, including nested locations, never survive. */
export function parseLocalGpsImport(value: unknown, ownerId: string): GpsImportPreview | null {
  keyFor(ownerId);
  try {
    const root = record(value);
    if (root.playerId !== ownerId) return null;
    const provenance = record(root.importProvenance);
    if (provenance.source !== 'wearable_file' || provenance.verification !== 'user_supplied' ||
        provenance.matchId !== null || provenance.synchronization !== 'not_synchronized' || provenance.orientation !== 'unknown' ||
        !['gpx', 'tcx', 'csv'].includes(String(provenance.format))) return null;
    const format = provenance.format;
    if (format !== 'gpx' && format !== 'tcx' && format !== 'csv') return null;
    const quality = record(root.importQuality);
    if (typeof quality.accuracyUnknown !== 'boolean' || root.status !== 'completed') return null;
    const metrics = record(root.metrics);
    const heatmap = record(root.heatmap);
    const extent = record(heatmap.extent);
    if (heatmap.rows !== GPS_TRACKING_CONFIG.heatmapRows || heatmap.cols !== GPS_TRACKING_CONFIG.heatmapCols ||
        !Array.isArray(heatmap.cells) || heatmap.cells.length > heatmap.rows * heatmap.cols) return null;
    const cells = heatmap.cells.map((value) => {
      const cell = record(value);
      const row = number(cell.row, true);
      const col = number(cell.col, true);
      const intensity = number(cell.intensity);
      if (row >= GPS_TRACKING_CONFIG.heatmapRows || col >= GPS_TRACKING_CONFIG.heatmapCols || intensity > 1) throw new Error('invalid');
      return { row, col, intensity };
    });
    return {
      session: {
        id: string(root.id, 150), playerId: ownerId, matchLabel: string(root.matchLabel, 100),
        status: 'completed', startedAt: date(root.startedAt), endedAt: date(root.endedAt), pausedDurationMs: 0,
        metrics: {
          distanceM: number(metrics.distanceM), durationSec: number(metrics.durationSec),
          activeDurationSec: number(metrics.activeDurationSec), pointCount: number(metrics.pointCount, true),
          avgSpeedKmh: number(metrics.avgSpeedKmh), maxSpeedKmh: number(metrics.maxSpeedKmh), sprintCount: number(metrics.sprintCount, true),
        },
        heatmap: { rows: GPS_TRACKING_CONFIG.heatmapRows, cols: GPS_TRACKING_CONFIG.heatmapCols, cells,
          extent: { lengthM: number(extent.lengthM), widthM: number(extent.widthM) } },
        zones: [], intelligence: null,
      },
      provenance: { source: 'wearable_file', format, verification: 'user_supplied', matchId: null, synchronization: 'not_synchronized', orientation: 'unknown' },
      quality: { rejected: number(quality.rejected, true), gaps: number(quality.gaps, true), segments: number(quality.segments, true), accuracyUnknown: quality.accuracyUnknown },
    };
  } catch { return null; }
}

function payload(value: GpsImportPreview): Record<string, unknown> {
  return { ...value.session, importProvenance: value.provenance, importQuality: value.quality };
}

export function createGpsImportStorage(adapter: GpsImportStorageAdapter) {
  const pending = new Map<string, Promise<void>>();
  // Keep cleanup after any already-started save, including saves from another screen.
  function ordered<T>(key: string, action: () => Promise<T>): Promise<T> {
    const operation = (pending.get(key) ?? Promise.resolve()).then(action);
    const tail = operation.then(() => undefined, () => undefined);
    pending.set(key, tail);
    void tail.then(() => { if (pending.get(key) === tail) pending.delete(key); });
    return operation;
  }
  return {
    async load(ownerId: string): Promise<GpsImportPreview | null> {
      const key = keyFor(ownerId);
      const raw = await ordered(key, () => adapter.getItem(key));
      if (!raw) return null;
      let value: unknown;
      try { value = JSON.parse(raw); } catch { return null; }
      return parseLocalGpsImport(value, ownerId);
    },
    async save(ownerId: string, value: GpsImportPreview): Promise<GpsImportPreview> {
      const key = keyFor(ownerId);
      if (value.session.playerId !== ownerId) throw new Error('owner');
      const sanitized = parseLocalGpsImport(payload(value), ownerId);
      if (!sanitized) throw new Error('invalid');
      await ordered(key, () => adapter.setItem(key, JSON.stringify(payload(sanitized))));
      return sanitized;
    },
    /** Idempotent owner-only cleanup for UI deletion and parent account-deletion flows. */
    async clear(ownerId: string): Promise<void> {
      const key = keyFor(ownerId);
      await ordered(key, () => adapter.removeItem(key));
    },
  };
}

// Lazy adapter keeps parsing and injected-storage tests independent of native modules.
let storage: Promise<ReturnType<typeof createGpsImportStorage>> | undefined;
function localStorage() {
  storage ??= import('@react-native-async-storage/async-storage').then(({ default: adapter }) => createGpsImportStorage(adapter));
  return storage;
}
export async function loadLocalGpsImport(ownerId: string): Promise<GpsImportPreview | null> {
  return (await localStorage()).load(ownerId);
}
export async function saveLocalGpsImport(ownerId: string, value: GpsImportPreview): Promise<GpsImportPreview> {
  return (await localStorage()).save(ownerId, value);
}
export async function clearLocalGpsImport(ownerId: string): Promise<void> {
  return (await localStorage()).clear(ownerId);
}
