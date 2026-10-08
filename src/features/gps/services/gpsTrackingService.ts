import * as Location from 'expo-location';
import { GPS_TRACKING_CONFIG } from '@/features/gps/constants';
import { toLocalPoint, type GeoOrigin } from '@/features/gps/models/GpsPointModel';
import { type GpsPoint } from '@/features/gps/types';

export type GpsPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type LocationUpdateHandler = (point: GpsPoint) => void;

export type GpsTrackingOptions = {
  /** Epoch ms when the session started; fixes are reported as elapsed time from here. */
  sessionStartMs: number;
  /** Segment number to use if a new local frame has to be started. */
  nextSegment: number;
};

let activeSubscription: Location.LocationSubscription | null = null;
// Held in memory only for the life of one recording so fixes can be made relative.
// Never persisted, logged or sent anywhere.
let origin: GeoOrigin | null = null;
let segment = 0;

/** Foreground "While Using" permission only. PitchProof never requests background location. */
export async function requestGpsPermissions(): Promise<GpsPermissionStatus> {
  const foreground = await Location.requestForegroundPermissionsAsync();

  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    return 'denied';
  }

  return 'granted';
}

export async function getGpsPermissionStatus(): Promise<GpsPermissionStatus> {
  const foreground = await Location.getForegroundPermissionsAsync();

  if (foreground.status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (foreground.status === Location.PermissionStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}

export async function startGpsTracking(
  onUpdate: LocationUpdateHandler,
  options: GpsTrackingOptions,
): Promise<void> {
  await stopGpsTracking();

  activeSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: GPS_TRACKING_CONFIG.timeIntervalMs,
      distanceInterval: GPS_TRACKING_CONFIG.distanceIntervalM,
      mayShowUserSettingsDialog: true,
    },
    (location) => {
      if (!origin) {
        origin = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        segment = options.nextSegment;
      }
      onUpdate(
        toLocalPoint(
          origin,
          {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            elapsedMs: location.timestamp - options.sessionStartMs,
            speed: location.coords.speed ?? 0,
            accuracy: location.coords.accuracy ?? 0,
          },
          segment,
        ),
      );
    },
  );
}

export async function stopGpsTracking(): Promise<void> {
  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }
}

/** Ends the recording frame. Call when a session is completed or discarded. */
export async function endGpsSession(): Promise<void> {
  await stopGpsTracking();
  origin = null;
  segment = 0;
}

export function isGpsTrackingActive(): boolean {
  return activeSubscription !== null;
}
