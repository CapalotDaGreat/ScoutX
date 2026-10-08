"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactLogText = redactLogText;
exports.logSafeError = logSafeError;
/**
 * Log-safe view of an error. Storage, fetch and ffmpeg messages can embed object paths, signed
 * URLs or tokens, so messages are redacted before they reach Cloud Logging.
 */
function redactLogText(text) {
    return text
        .replace(/https?:\/\/[^\s"')]+/g, '[url]')
        .replace(/\b(?:profiles|quarantine|users|players|matchFootage|analysis)\/[^\s"')]+/g, '[path]')
        .replace(/\b(?:token|signature|X-Goog-[A-Za-z-]+|upload_id|access_token)=[^\s&"')]+/gi, '[secret]')
        .slice(0, 300);
}
function logSafeError(error) {
    if (error instanceof Error)
        return { errorName: error.name, message: redactLogText(error.message) };
    return { errorName: 'unknown', message: 'unknown' };
}
//# sourceMappingURL=redact.js.map