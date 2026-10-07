import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  defaultDistanceUnit,
  isDistanceUnit,
  type DistanceUnit,
} from '@/features/gps/services/gpsSessionCalculator';

const STORAGE_KEY = 'scoutx.distanceUnit';

let current: DistanceUnit = defaultDistanceUnit(Localization.getLocales()[0]?.measurementSystem);
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setDistanceUnit(unit: DistanceUnit): Promise<void> {
  current = unit;
  emit();
  await AsyncStorage.setItem(STORAGE_KEY, unit);
}

/** Display-only preference stored on this device; recorded sessions always keep metres. */
export function useDistanceUnit(): DistanceUnit {
  const unit = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (isDistanceUnit(stored) && stored !== current) {
        current = stored;
        emit();
      }
    });
  }, []);
  return unit;
}
