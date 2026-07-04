import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPS_STORAGE_KEYS } from '@/features/gps/constants';
import {
  compactGpsPoints,
  expandGpsPoints,
} from '@/features/gps/models/GpsPointModel';
import {
  type CompactGpsPoint,
  type GpsPoint,
  type GpsSession,
} from '@/features/gps/types';

type ActiveSessionPayload = {
  session: GpsSession;
  points: CompactGpsPoint[];
};

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
  return {
    session: payload.session,
    points: expandGpsPoints(payload.points),
  };
}

export async function clearActiveSession(): Promise<void> {
  await AsyncStorage.removeItem(GPS_STORAGE_KEYS.activeSession);
}

export async function saveLocalSessions(sessions: GpsSession[]): Promise<void> {
  await AsyncStorage.setItem(GPS_STORAGE_KEYS.localSessions, JSON.stringify(sessions));
}

export async function loadLocalSessions(): Promise<GpsSession[]> {
  const raw = await AsyncStorage.getItem(GPS_STORAGE_KEYS.localSessions);
  if (!raw) {
    return [];
  }

  const sessions = JSON.parse(raw) as GpsSession[];
  return Array.isArray(sessions) ? sessions : [];
}

export function serializePointsForStorage(points: GpsPoint[]): string {
  return JSON.stringify(compactGpsPoints(points));
}

export function deserializePointsFromStorage(raw: string): GpsPoint[] {
  const compactPoints = JSON.parse(raw) as CompactGpsPoint[];
  return expandGpsPoints(compactPoints);
}
