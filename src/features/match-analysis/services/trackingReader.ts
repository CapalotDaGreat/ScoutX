/** Auth-scoped polling transport: no persistent tracking cache and no direct Firestore fallback. */
import { TRACKING_STORAGE_ENCODING, decodeTrackingStorage } from './trackingStorage';
export const TRACKING_READ_INTERVAL_MS = 15000;
export type TrackingRead = { current: Record<string, unknown> | null; discovery: Record<string, unknown> | null };
export function pollTrackingReader(read: () => Promise<unknown>, onChange: (value: TrackingRead | null) => void,
  onError?: (error: Error) => void,
  timers = { schedule: (fn: () => void, delay: number) => setTimeout(fn, delay), cancel: (id: ReturnType<typeof setTimeout>) => clearTimeout(id) }): () => void {
  let active = true;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    try {
      const raw = await read() as Record<string, unknown>;
      if (!active) return;
      if (!raw || raw.readerEncoding !== TRACKING_STORAGE_ENCODING || !('current' in raw) || !('discovery' in raw)) {
        throw new Error('Compatible tracking reader response required');
      }
      failures = 0;
      onChange({ current: raw.current === null ? null : decodeTrackingStorage(raw.current),
        discovery: raw.discovery === null ? null : decodeTrackingStorage(raw.discovery) });
    } catch (error) {
      if (!active) return;
      failures = Math.min(failures + 1, 5);
      onChange(null);
      onError?.(error instanceof Error ? error : new Error('Tracking read failed'));
    } finally {
      if (active) timer = timers.schedule(() => { void poll(); }, Math.min(300000, TRACKING_READ_INTERVAL_MS * 2 ** failures));
    }
  };
  void poll();
  return () => { active = false; if (timer !== undefined) timers.cancel(timer); };
}
