const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/** Mirrors functions/src/uploads/model.ts; GCS requires chunks in 256 KiB multiples except the last. */
export const CHUNKED_UPLOAD = {
  chunkBytes: 8 * MIB,
  maxBytes: 4 * GIB,
  minBytes: 1024,
  maxDurationSec: 9000,
  fingerprintEdgeBytes: 8 * MIB,
} as const;

export type UploadContentType = 'video/mp4' | 'video/quicktime';

export function contentTypeForFileName(fileName: string | undefined): UploadContentType {
  return /\.(mov|qt)$/i.test(fileName ?? '') ? 'video/quicktime' : 'video/mp4';
}

export function chunkLength(offset: number, total: number, chunkBytes: number = CHUNKED_UPLOAD.chunkBytes): number {
  return Math.max(0, Math.min(chunkBytes, total - offset));
}

export function contentRangeHeader(offset: number, length: number, total: number): string {
  return `bytes ${offset}-${offset + length - 1}/${total}`;
}

export function offsetQueryHeader(total: number): string {
  return `bytes */${total}`;
}

/** Parses the `Range: bytes=0-N` header of a GCS 308 reply into the next byte to send. */
export function nextOffsetFromRange(range: string | null | undefined): number {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  return match ? Number(match[1]) + 1 : 0;
}

export type SpeedSample = { atMs: number; sentBytes: number };

/** Average throughput over the trailing window, or null until there is enough signal. */
export function bytesPerSecond(samples: SpeedSample[], nowMs: number, windowMs = 15_000): number | null {
  const recent = samples.filter((sample) => nowMs - sample.atMs <= windowMs);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = (last.atMs - first.atMs) / 1000;
  if (elapsed <= 0) return null;
  const rate = (last.sentBytes - first.sentBytes) / elapsed;
  return rate > 0 ? rate : null;
}

export function etaSeconds(remainingBytes: number, rate: number | null): number | null {
  if (!rate || rate <= 0) return null;
  return Math.ceil(Math.max(0, remainingBytes) / rate);
}

export function formatBytes(bytes: number): string {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(2)} GB`;
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(bytes >= 100 * MIB ? 0 : 1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

export function formatRate(rate: number | null): string | null {
  return rate ? `${formatBytes(rate)}/s` : null;
}

export function formatEta(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

export function progressFraction(sentBytes: number, totalBytes: number): number {
  return totalBytes > 0 ? Math.min(1, Math.max(0, sentBytes / totalBytes)) : 0;
}
