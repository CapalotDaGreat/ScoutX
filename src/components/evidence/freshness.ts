export type FreshnessInput = {
  updatedAt: string | null;
  sampleSize: number | null;
  nowMs?: number;
};

/** Newest valid ISO date in the list, or null when none parse. */
export function latestDate(dates: readonly (string | null | undefined)[]): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const date of dates) {
    if (!date) continue;
    const ms = Date.parse(date);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latest = date;
    }
  }
  return latest;
}

export function formatFreshness(input: FreshnessInput): {
  daysAgo: number | null;
  sampleSize: number | null;
  known: boolean;
} {
  const sampleSize =
    typeof input.sampleSize === 'number' && Number.isFinite(input.sampleSize) ? input.sampleSize : null;
  if (!input.updatedAt) {
    return { daysAgo: null, sampleSize, known: false };
  }
  const at = new Date(input.updatedAt).getTime();
  if (!Number.isFinite(at)) {
    return { daysAgo: null, sampleSize, known: false };
  }
  const now = input.nowMs ?? Date.now();
  const daysAgo = Math.max(0, Math.floor((now - at) / (1000 * 60 * 60 * 24)));
  return { daysAgo, sampleSize, known: true };
}
