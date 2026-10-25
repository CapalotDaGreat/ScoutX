import { DOMParser } from '@xmldom/xmldom';
import { toLocalPoint } from '@/features/gps/models/GpsPointModel';
import { createGpsSession, createEmptyHeatmap } from '@/features/gps/models/GpsSessionModel';
import { calculateSessionMetrics, generateHeatmapGrid } from '@/features/gps/services/gpsSessionCalculator';
import type { GpsPoint, GpsSession } from '@/features/gps/types';
import { createSecureId } from '@/utils/secureId';

export const GPS_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_POINTS = 50_000;
type Format = 'gpx' | 'tcx' | 'csv';
type Fix = { latitude: number; longitude: number; time: number; segment: number; accuracy: number };
export type GpsImportPreview = {
  session: GpsSession;
  provenance: {
    source: 'wearable_file'; format: Format; verification: 'user_supplied';
    matchId: null; synchronization: 'not_synchronized'; orientation: 'unknown';
  };
  quality: { rejected: number; gaps: number; segments: number; accuracyUnknown: boolean };
};

function invalid(): never { throw new Error('invalid'); }
function numeric(text: string | null | undefined): number {
  if (!text?.trim()) return invalid();
  const value = Number(text);
  return Number.isFinite(value) ? value : invalid();
}
function timestamp(text: string | null | undefined): number {
  // Require a timezone: device-local clock assumptions can silently misalign a match.
  if (!text || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(text)) return invalid();
  const value = Date.parse(text);
  return Number.isFinite(value) ? value : invalid();
}
function children(element: Element, name: string): Element[] {
  return Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1 && (node as Element).localName === name);
}
function text(element: Element, name: string): string | null {
  return children(element, name)[0]?.textContent ?? null;
}
function xmlFixes(content: string, format: 'gpx' | 'tcx'): Fix[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(content)) return invalid();
  const fail = () => invalid();
  const document = new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } }).parseFromString(content, 'text/xml');
  const root = document.documentElement;
  if (root.localName !== (format === 'gpx' ? 'gpx' : 'TrainingCenterDatabase')) return invalid();
  const groups = Array.from(root.getElementsByTagNameNS('*', format === 'gpx' ? 'trkseg' : 'Track'));
  const fixes: Fix[] = [];
  groups.forEach((group, segment) => {
    for (const point of children(group, format === 'gpx' ? 'trkpt' : 'Trackpoint')) {
      const position = format === 'gpx' ? point : children(point, 'Position')[0];
      if (!position) return invalid();
      fixes.push({
        latitude: numeric(format === 'gpx' ? point.getAttribute('lat') : text(position, 'LatitudeDegrees')),
        longitude: numeric(format === 'gpx' ? point.getAttribute('lon') : text(position, 'LongitudeDegrees')),
        time: timestamp(text(point, format === 'gpx' ? 'time' : 'Time')),
        segment, accuracy: 0,
      });
      if (fixes.length > MAX_POINTS) throw new Error('tooLarge');
    }
  });
  return fixes;
}
function csvFixes(content: string): Fix[] {
  // Deliberately narrow numeric CSV, not a general RFC4180/vendor-report parser.
  if (content.includes('"')) return invalid();
  const lines = content.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines.shift()?.trim();
  if (header !== 'timestamp,latitude,longitude' && header !== 'timestamp,latitude,longitude,accuracy_m') return invalid();
  if (lines.length > MAX_POINTS) throw new Error('tooLarge');
  return lines.map((line) => {
    const fields = line.split(',').map((field) => field.trim());
    if (fields.length !== header.split(',').length) return invalid();
    return { time: timestamp(fields[0]), latitude: numeric(fields[1]), longitude: numeric(fields[2]), accuracy: fields.length === 4 ? numeric(fields[3]) : 0, segment: 0 };
  });
}

/** Raw geographic fixes and file metadata never escape this synchronous boundary. */
export function previewGpsImport(content: string, extension: string, ownerId: string): GpsImportPreview {
  if (!ownerId.trim()) throw new Error('owner');
  if (content.length > GPS_IMPORT_MAX_BYTES || new TextEncoder().encode(content).length > GPS_IMPORT_MAX_BYTES) throw new Error('tooLarge');
  const format = extension.toLowerCase();
  if (format !== 'gpx' && format !== 'tcx' && format !== 'csv') throw new Error('unsupported');
  const fixes = format === 'csv' ? csvFixes(content) : xmlFixes(content, format);
  const points: GpsPoint[] = [];
  let previous: Fix | undefined;
  let origin: Fix | undefined;
  let segment = -1;
  let gaps = 0;
  let rejected = 0;
  let start = 0;
  for (const fix of fixes) {
    if (Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180 || fix.accuracy < 0) return invalid();
    if (previous && fix.time <= previous.time) { rejected++; continue; }
    if (fix.accuracy > 20) { rejected++; continue; }
    const dt = previous ? fix.time - previous.time : 0;
    let speed = 0;
    const newSegment = !previous || previous.segment !== fix.segment || dt > 10_000;
    if (!newSegment && previous) {
      const delta = toLocalPoint(previous, { ...fix, elapsedMs: 0, speed: 0 }, 0);
      speed = Math.hypot(delta.x, delta.y) / (dt / 1000);
      if (speed > 12) { rejected++; continue; }
    }
    if (newSegment) {
      if (previous) gaps++;
      origin = fix;
      segment++;
    }
    if (!points.length) start = fix.time;
    if (!origin) return invalid();
    points.push(toLocalPoint(origin, { ...fix, elapsedMs: fix.time - start, speed }, segment));
    previous = fix;
  }
  if (points.length < 2) return invalid();
  const runs: GpsPoint[][] = [];
  for (const point of points) {
    if (!runs[point.segment]) runs[point.segment] = [];
    runs[point.segment].push(point);
  }
  const metrics = runs.map((run) => calculateSessionMetrics(run, 0));
  const durationSec = metrics.reduce((sum, item) => sum + item.durationSec, 0);
  if (durationSec <= 0) return invalid();
  const distanceM = metrics.reduce((sum, item) => sum + item.distanceM, 0);
  const session = createGpsSession({ id: createSecureId('gps-import'), playerId: ownerId, matchLabel: '', status: 'completed' });
  session.metrics = {
    distanceM, durationSec, activeDurationSec: durationSec, pointCount: points.length,
    avgSpeedKmh: Math.round(distanceM / durationSec * 36) / 10,
    maxSpeedKmh: Math.max(...metrics.map((item) => item.maxSpeedKmh)),
    sprintCount: metrics.reduce((sum, item) => sum + item.sprintCount, 0),
  };
  // Independent local frames cannot be merged into an honest spatial heatmap.
  session.heatmap = runs.length === 1 ? generateHeatmapGrid(points) : createEmptyHeatmap();
  session.endedAt = session.startedAt; // Import time, never the original geographic fix clock.
  return {
    session,
    provenance: { source: 'wearable_file', format, verification: 'user_supplied', matchId: null, synchronization: 'not_synchronized', orientation: 'unknown' },
    quality: { rejected, gaps, segments: runs.length, accuracyUnknown: points.some((point) => point.accuracy === 0) },
  };
}

export function confirmGpsImport(preview: GpsImportPreview, ownerId: string, label: string): GpsImportPreview {
  if (!ownerId || preview.session.playerId !== ownerId) throw new Error('owner');
  if (!label.trim() || label.length > 100) return invalid();
  return { ...preview, session: { ...preview.session, matchLabel: label.trim() } };
}
