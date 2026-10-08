/**
 * Log-safe view of an error. Storage, fetch and ffmpeg messages can embed object paths, signed
 * URLs or tokens, so messages are redacted before they reach Cloud Logging.
 */
export function redactLogText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"')]+/g, '[url]')
    .replace(/\b(?:profiles|quarantine|users|players|matchFootage|analysis)\/[^\s"')]+/g, '[path]')
    .replace(/\b(?:token|signature|X-Goog-[A-Za-z-]+|upload_id|access_token)=[^\s&"')]+/gi, '[secret]')
    .slice(0, 300);
}

export function logSafeError(error: unknown): { errorName: string; message: string } {
  if (error instanceof Error) return { errorName: error.name, message: redactLogText(error.message) };
  return { errorName: 'unknown', message: 'unknown' };
}
