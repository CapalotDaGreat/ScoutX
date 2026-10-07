import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPS_STORAGE_KEYS } from '@/features/gps/constants';
import {
  compactGpsPoints,
  expandGpsPoints,
  isCompactGpsPoint,
} from '@/features/gps/models/GpsPointModel';
import { type GpsPoint, type GpsSession } from '@/features/gps/types';

type ActiveSessionPayload = {
  session: GpsSession;
  points: unknown[];
};

/** Crash recovery for an in-progress session. Points are session-local metres only. */
export async function saveActiveSession(
  session: GpsSession,
  points: GpsPoint[],
): Promise<void> {
  const payload: ActiveSessionPayload = {
    session,
    points: compactGpsPoints(points),
  };

  await AsyncStorage.setItem(GPS_STORAGE_KEYS.activeSession, JSON.stringify(payload));
}

export async function loadActiveSession(): Promise<{
  session: GpsSession;
  points: GpsPoint[];
} | null> {
  const raw = await AsyncStorage.getItem(GPS_STORAGE_KEYS.activeSession);
  if (!raw) {
    return null;
  }

  const payload = JSON.parse(raw) as ActiveSessionPayload;
  const points = Array.isArray(payload.points) ? payload.points : [];
  // Sessions saved by older builds held latitude/longitude; drop them rather than resume.
  if (!points.every(isCompactGpsPoint)) {
    await clearActiveSession();
    return null;
  }
  return {
    session: payload.session,
    points: expandGpsPoints(points),
  };
}

export async function clearActiveSession(): Promise<void> {
  await AsyncStorage.removeItem(GPS_STORAGE_KEYS.activeSession);
}

export async function saveLocalSessions(sessions: GpsSession[]): Promise<void> {
  await AsyncStorage.setItem(GPS_STORAGE_KEYS.localSessions, JSON.stringify(sessions));
}

export async function loadLocalSessions(): Promise<unknown[]> {
  const raw = await AsyncStorage.getItem(GPS_STORAGE_KEYS.localSessions);
  if (!raw) {
    return [];
  }

  const sessions = JSON.parse(raw) as unknown;
  return Array.isArray(sessions) ? sessions : [];
}

/** Removes keys left by builds that stored raw location on the device. */
export async function purgeLegacyLocalLocation(): Promise<void> {
  await AsyncStorage.removeItem(GPS_STORAGE_KEYS.legacyActivePoints);
}
