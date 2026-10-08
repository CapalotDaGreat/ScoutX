/** Copies of finished uploads are kept this long for the on-device fallback, then swept. */
export const UPLOAD_COPY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** File names carry the creation time so the sweep never depends on the video's own timestamps. */
export function uploadCopyName(jobId: string, extension: string, now: number = Date.now()): string {
  const safeJob = jobId.replace(/[^A-Za-z0-9_-]/g, '_');
  const ext = /^\.[A-Za-z0-9]{1,5}$/.test(extension) ? extension.toLowerCase() : '.mp4';
  return `${safeJob}-${now}${ext}`;
}

export function uploadCopyCreatedAt(name: string): number | null {
  const match = /-(\d{13})\.[a-z0-9]{1,5}$/.exec(name);
  return match ? Number(match[1]) : null;
}

/** True only for unreferenced copies whose embedded creation time is past the keep window. */
export function isSweepableCopy(name: string, referenced: boolean, now: number): boolean {
  if (referenced) return false;
  const createdAt = uploadCopyCreatedAt(name);
  return createdAt !== null && now - createdAt >= UPLOAD_COPY_MAX_AGE_MS;
}
