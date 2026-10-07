import { doc, getDocs, collection, setDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { getFirestoreDb, getFirebaseStorage } from '@/config/firebase';
import { finalizeGpsSession } from '@/features/gps/models/GpsSessionModel';
import {
  calculateMovementZones,
  calculateSessionMetrics,
  generateHeatmapGrid,
} from '@/features/gps/services/gpsSessionCalculator';
import {
  clearActiveSession,
  loadLocalSessions,
  saveLocalSessions,
  deserializePointsFromStorage,
  serializePointsForStorage,
} from '@/features/gps/services/gpsSessionStorage';
import { type GpsPoint, type GpsSession } from '@/features/gps/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseGpsSession(value: unknown): GpsSession | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') {
    return null;
  }

  const metrics = asRecord(record.metrics);
  const heatmap = asRecord(record.heatmap);
  const heatmapBounds = asRecord(heatmap?.bounds);

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
    pausedDurationMs:
      typeof record.pausedDurationMs === 'number' ? record.pausedDurationMs : 0,
    metrics: {
      distanceM: typeof metrics?.distanceM === 'number' ? metrics.distanceM : 0,
      avgSpeedKmh: typeof metrics?.avgSpeedKmh === 'number' ? metrics.avgSpeedKmh : 0,
      maxSpeedKmh: typeof metrics?.maxSpeedKmh === 'number' ? metrics.maxSpeedKmh : 0,
      sprintCount: typeof metrics?.sprintCount === 'number' ? metrics.sprintCount : 0,
      durationSec: typeof metrics?.durationSec === 'number' ? metrics.durationSec : 0,
      activeDurationSec:
        typeof metrics?.activeDurationSec === 'number' ? metrics.activeDurationSec : 0,
      pointCount: typeof metrics?.pointCount === 'number' ? metrics.pointCount : 0,
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
              percentage:
                typeof zoneRecord.percentage === 'number' ? zoneRecord.percentage : 0,
              durationSec:
                typeof zoneRecord.durationSec === 'number' ? zoneRecord.durationSec : 0,
            };
          })
          .filter((zone): zone is GpsSession['zones'][number] => zone !== null)
      : [],
    heatmap: {
      rows: typeof heatmap?.rows === 'number' ? heatmap.rows : 0,
      cols: typeof heatmap?.cols === 'number' ? heatmap.cols : 0,
      cells: Array.isArray(heatmap?.cells)
        ? heatmap.cells
            .map((cell) => {
              const cellRecord = asRecord(cell);
              if (!cellRecord) {
                return null;
              }

              return {
                row: typeof cellRecord.row === 'number' ? cellRecord.row : 0,
                col: typeof cellRecord.col === 'number' ? cellRecord.col : 0,
                intensity:
                  typeof cellRecord.intensity === 'number' ? cellRecord.intensity : 0,
              };
            })
            .filter((cell): cell is GpsSession['heatmap']['cells'][number] => cell !== null)
        : [],
      bounds: {
        minLat: typeof heatmapBounds?.minLat === 'number' ? heatmapBounds.minLat : 0,
        maxLat: typeof heatmapBounds?.maxLat === 'number' ? heatmapBounds.maxLat : 0,
        minLng: typeof heatmapBounds?.minLng === 'number' ? heatmapBounds.minLng : 0,
        maxLng: typeof heatmapBounds?.maxLng === 'number' ? heatmapBounds.maxLng : 0,
      },
    },
    pointsStorageKey:
      typeof record.pointsStorageKey === 'string' ? record.pointsStorageKey : null,
  };
}

export class GpsSessionRepository {
  private static instance: GpsSessionRepository | null = null;

  private constructor() {}

  public static getInstance(): GpsSessionRepository {
    if (!this.instance) {
      this.instance = new GpsSessionRepository();
    }
    return this.instance;
  }

  public async fetchSessions(playerId: string): Promise<GpsSession[]> {
    const db = getFirestoreDb();

    if (!db) {
      const localSessions = await loadLocalSessions();
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
      const localSessions = await loadLocalSessions();
      return localSessions.filter((session) => session.playerId === playerId);
    }
  }

  public async completeSession(
    session: GpsSession,
    points: GpsPoint[],
  ): Promise<GpsSession> {
    const metrics = calculateSessionMetrics(points, session.pausedDurationMs);
    const zones = calculateMovementZones(points);
    const heatmap = generateHeatmapGrid(points);
    const pointsPayload = serializePointsForStorage(points);
    const pointsStorageKey = `gpsSessions/${session.playerId}/${session.id}/points.json`;

    let completedSession = finalizeGpsSession(
      session,
      metrics,
      zones,
      heatmap,
      pointsStorageKey,
    );

    const storage = getFirebaseStorage();
    const db = getFirestoreDb();

    if (storage) {
      try {
        const storageRef = ref(storage, pointsStorageKey);
        await uploadString(storageRef, pointsPayload, 'raw', {
          contentType: 'application/json',
        });
        await getDownloadURL(storageRef);
      } catch {
        completedSession = {
          ...completedSession,
          pointsStorageKey: null,
        };
      }
    }

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

    const localSessions = await loadLocalSessions();
    const nextSessions = [
      completedSession,
      ...localSessions.filter((item) => item.id !== completedSession.id),
    ].slice(0, 20);
    await saveLocalSessions(nextSessions);
    await clearActiveSession();

    return completedSession;
  }

  /** Stored points for a completed session, or an empty list when none were uploaded. */
  public async loadSessionPoints(session: GpsSession): Promise<GpsPoint[]> {
    const storage = getFirebaseStorage();
    if (!storage || !session.pointsStorageKey) {
      return [];
    }
    const url = await getDownloadURL(ref(storage, session.pointsStorageKey));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GPS points unavailable (${response.status}).`);
    }
    return deserializePointsFromStorage(await response.text());
  }
}
