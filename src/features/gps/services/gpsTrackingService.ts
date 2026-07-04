import * as Location from 'expo-location';
import { GPS_TRACKING_CONFIG } from '@/features/gps/constants';
import { createGpsPoint } from '@/features/gps/models/GpsPointModel';
import { type GpsPoint } from '@/features/gps/types';

export type GpsPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type LocationUpdateHandler = (point: GpsPoint) => void;

let activeSubscription: Location.LocationSubscription | null = null;

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

function mapAccuracy(): Location.Accuracy {
  return Location.Accuracy.Balanced;
}

export async function startGpsTracking(onUpdate: LocationUpdateHandler): Promise<void> {
  await stopGpsTracking();

  activeSubscription = await Location.watchPositionAsync(
    {
      accuracy: mapAccuracy(),
      timeInterval: GPS_TRACKING_CONFIG.timeIntervalMs,
      distanceInterval: GPS_TRACKING_CONFIG.distanceIntervalM,
      mayShowUserSettingsDialog: true,
    },
    (location) => {
      const point = createGpsPoint(
        location.coords.latitude,
        location.coords.longitude,
        location.timestamp,
        Math.max(location.coords.speed ?? 0, 0),
        location.coords.accuracy ?? 0,
      );

      onUpdate(point);
    },
  );
}

export async function stopGpsTracking(): Promise<void> {
  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }
}

export function isGpsTrackingActive(): boolean {
  return activeSubscription !== null;
}
