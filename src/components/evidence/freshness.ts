export type FreshnessInput = {
  updatedAt: string | null;
  sampleSize: number | null;
  nowMs?: number;
};

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
