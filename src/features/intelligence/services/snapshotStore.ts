import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSnapshot } from '@/features/intelligence/services/changeDetection';
import type { FootballStateSnapshot } from '@/features/intelligence/types';

const PREFIX = '@scoutx/seen-snapshot/';

/**
 * Per-device memory of what a viewer last saw. `scope` separates the player's own Today
 * (`self`) from a scout's view of a watched player (`scout:{playerId}`).
 */
function key(viewerId: string, scope: string): string {
  return `${PREFIX}${viewerId}/${scope}`;
}

export async function loadSeenSnapshot(
  viewerId: string,
  scope: string,
): Promise<FootballStateSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(key(viewerId, scope));
    return raw ? parseSnapshot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveSeenSnapshot(
  viewerId: string,
  scope: string,
  snapshot: FootballStateSnapshot,
): Promise<void> {
  try {
    await AsyncStorage.setItem(key(viewerId, scope), JSON.stringify(snapshot));
  } catch {
    // Losing a "seen" marker only means a change is shown once more; never block the UI.
  }
}
