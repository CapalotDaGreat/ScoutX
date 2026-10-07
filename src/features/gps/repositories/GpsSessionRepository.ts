import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDocs, collection, setDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { GPS_STORAGE_KEYS } from '@/features/gps/constants';
import { finalizeGpsSession } from '@/features/gps/models/GpsSessionModel';
import { buildGpsIntelligence } from '@/features/gps/services/gpsIntelligence';
import {
  calculateMovementZones,
  calculateSessionMetrics,
  generateHeatmapGrid,
} from '@/features/gps/services/gpsSessionCalculator';
import {
  clearActiveSession,
  loadLocalSessions,
  purgeLegacyLocalLocation,
  saveLocalSessions,
} from '@/features/gps/services/gpsSessionStorage';
import type {
  GpsIntelligence,
  GpsPoint,
  GpsSession,
  GpsSprint,
  SpeedBand,
} from '@/features/gps/types';
import { createCallableFunction } from '@/firebase/callableFunctions';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseIntelligence(value: unknown): GpsIntelligence | null {
  const record = asRecord(value);
  if (!record || (record.status !== 'ok' && record.status !== 'insufficient' && record.status !== 'low_accuracy')) {
    return null;
  }
  const sample = asRecord(record.sample);
  const bands = asRecord(record.bands);
  const sprints = Array.isArray(record.sprints)
    ? record.sprints
        .map((item): GpsSprint | null => {
          const sprint = asRecord(item);
          if (!sprint || typeof sprint.startSec !== 'number' || typeof sprint.endSec !== 'number') {
            return null;
          }
          return { startSec: sprint.startSec, endSec: sprint.endSec, peakKmh: numberOr(sprint.peakKmh, 0) };
        })
        .filter((sprint): sprint is GpsSprint => sprint !== null)
    : [];
  const bandKeys: SpeedBand[] = ['walk', 'jog', 'run', 'sprint'];
  return {
    status: record.status,
    sample: {
      points: numberOr(sample?.points, 0),
      durationSec: numberOr(sample?.durationSec, 0),
      medianAccuracyM: numberOr(sample?.medianAccuracyM, null),
    },
    widthM: numberOr(record.widthM, null),
    depthM: numberOr(record.depthM, null),
    centralSharePct: numberOr(record.centralSharePct, null),
    bands: bands
      ? (Object.fromEntries(bandKeys.map((key) => [key, numberOr(bands[key], 0)])) as Record<SpeedBand, number>)
      : null,
    sprints,
  };
}

/** Reads only the location-free summary fields; legacy coordinate bounds are dropped. */
export function parseGpsSession(value: unknown): GpsSession | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') {
    return null;
  }

  const metrics = asRecord(record.metrics);
  const heatmap = asRecord(record.heatmap);
  const extent = asRecord(heatmap?.extent);

  return {
    id: record.id,
    playerId: typeof record.playerId === 'string' ? record.playerId : '',
    matchLabel: typeof record.matchLabel === 'string' ? record.matchLabel : 'Match',
    status:
      record.status === 'recording' ||
      record.status === 'paused' ||
      record.status === 'completed' ||
      record.status === 'idle'
        ? record.status
        : 'completed',
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : new Date().toISOString(),
    endedAt: typeof record.endedAt === 'string' ? record.endedAt : null,
    pausedDurationMs: numberOr(record.pausedDurationMs, 0),
    metrics: {
      distanceM: numberOr(metrics?.distanceM, 0),
      avgSpeedKmh: numberOr(metrics?.avgSpeedKmh, 0),
      maxSpeedKmh: numberOr(metrics?.maxSpeedKmh, 0),
      sprintCount: numberOr(metrics?.sprintCount, 0),
      durationSec: numberOr(metrics?.durationSec, 0),
      activeDurationSec: numberOr(metrics?.activeDurationSec, 0),
      pointCount: numberOr(metrics?.pointCount, 0),
    },
    zones: Array.isArray(record.zones)
      ? record.zones
          .map((zone) => {
            const zoneRecord = asRecord(zone);
            if (!zoneRecord) {
              return null;
            }

            return {
              zone:
                zoneRecord.zone === 'defensive' ||
                zoneRecord.zone === 'middle' ||
                zoneRecord.zone === 'attacking'
                  ? zoneRecord.zone
                  : 'middle',
              label: typeof zoneRecord.label === 'string' ? zoneRecord.label : 'Zone',
              percentage: numberOr(zoneRecord.percentage, 0),
              durationSec: numberOr(zoneRecord.durationSec, 0),
            };
          })
          .filter((zone): zone is GpsSession['zones'][number] => zone !== null)
      : [],
    heatmap: {
      rows: numberOr(heatmap?.rows, 0),
      cols: numberOr(heatmap?.cols, 0),
      cells: Array.isArray(heatmap?.cells)
        ? heatmap.cells
            .map((cell) => {
              const cellRecord = asRecord(cell);
              if (!cellRecord) {
                return null;
              }

              return {
                row: numberOr(cellRecord.row, 0),
                col: numberOr(cellRecord.col, 0),
                intensity: numberOr(cellRecord.intensity, 0),
              };
            })
            .filter((cell): cell is GpsSession['heatmap']['cells'][number] => cell !== null)
        : [],
      extent: { lengthM: numberOr(extent?.lengthM, 0), widthM: numberOr(extent?.widthM, 0) },
    },
    intelligence: parseIntelligence(record.intelligence),
  };
}

export class GpsSessionRepository {
  private static instance: GpsSessionRepository | null = null;
  private readonly purgeLegacyCallable = createCallableFunction<Record<string, never>>('purgeLegacyGpsLocation');

  private constructor() {}

  public static getInstance(): GpsSessionRepository {
    if (!this.instance) {
      this.instance = new GpsSessionRepository();
    }
    return this.instance;
  }

  private async readLocalSessions(): Promise<GpsSession[]> {
    return (await loadLocalSessions())
      .map(parseGpsSession)
      .filter((session): session is GpsSession => session !== null);
  }

  /**
   * One-time cleanup per user of location data written by builds before on-device
   * processing: legacy points.json files and coordinate fields on session documents.
   */
  public async purgeLegacyLocation(playerId: string): Promise<void> {
    const flagKey = `${GPS_STORAGE_KEYS.legacyPurged}/${playerId}`;
    if ((await AsyncStorage.getItem(flagKey)) === 'done') {
      return;
    }
    await purgeLegacyLocalLocation();
    await saveLocalSessions(await this.readLocalSessions());
    if (this.purgeLegacyCallable) {
      await this.purgeLegacyCallable({});
    }
    await AsyncStorage.setItem(flagKey, 'done');
  }

  public async fetchSessions(playerId: string): Promise<GpsSession[]> {
    void this.purgeLegacyLocation(playerId).catch(() => undefined);
    const db = getFirestoreDb();

    if (!db) {
      const localSessions = await this.readLocalSessions();
      return localSessions.filter((session) => session.playerId === playerId);
    }

    try {
      const sessionsRef = collection(db, 'gpsSessions');
      const sessionsQuery = query(
        sessionsRef,
        where('playerId', '==', playerId),
        orderBy('startedAt', 'desc'),
        limit(20),
      );
      const snapshot = await getDocs(sessionsQuery);

      return snapshot.docs
        .map((document) => parseGpsSession({ id: document.id, ...document.data() }))
        .filter((session): session is GpsSession => session !== null);
    } catch {
      const localSessions = await this.readLocalSessions();
      return localSessions.filter((session) => session.playerId === playerId);
    }
  }

  /** Summarises on device; only the summary is saved. The point track is discarded. */
  public async completeSession(
    session: GpsSession,
    points: GpsPoint[],
  ): Promise<GpsSession> {
    const completedSession = finalizeGpsSession(
      session,
      calculateSessionMetrics(points, session.pausedDurationMs),
      calculateMovementZones(points),
      generateHeatmapGrid(points),
      buildGpsIntelligence(points),
    );

    const db = getFirestoreDb();
    if (db) {
      try {
        await setDoc(doc(db, 'gpsSessions', session.id), {
          ...completedSession,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Fall back to local persistence below.
      }
    }

    const localSessions = await this.readLocalSessions();
    const nextSessions = [
      completedSession,
      ...localSessions.filter((item) => item.id !== completedSession.id),
    ].slice(0, 20);
    await saveLocalSessions(nextSessions);
    await clearActiveSession();

    return completedSession;
  }
}
