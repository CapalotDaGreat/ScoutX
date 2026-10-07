"use strict";
// Pure upload rules shared by the session callables, the quarantine trigger and unit tests.
Object.defineProperty(exports, "__esModule", { value: true });
exports.REUSABLE_UPLOAD_STATES = exports.ACTIVE_UPLOAD_STATES = exports.UPLOAD_STATES = exports.UPLOAD_PURPOSES = exports.UPLOAD_CONTENT_TYPES = exports.UPLOAD_LIMITS = exports.GiB = exports.MiB = void 0;
exports.sanitizeFileName = sanitizeFileName;
exports.parseUploadRequest = parseUploadRequest;
exports.quarantinePath = quarantinePath;
exports.parseQuarantinePath = parseQuarantinePath;
exports.matchFootagePath = matchFootagePath;
exports.footageMediaId = footageMediaId;
exports.isAbandoned = isAbandoned;
exports.dayKey = dayKey;
exports.MiB = 1024 * 1024;
exports.GiB = 1024 * exports.MiB;
exports.UPLOAD_LIMITS = {
    maxBytes: 4 * exports.GiB,
    maxDurationSec: 150 * 60,
    minBytes: 1024,
    chunkBytes: 8 * exports.MiB,
    /** Uploads that never finish are expired and their quarantine objects deleted. */
    abandonAfterDays: 7,
    maxActivePerUser: 2,
    maxSessionsPerDay: 10,
};
exports.UPLOAD_CONTENT_TYPES = ['video/mp4', 'video/quicktime'];
exports.UPLOAD_PURPOSES = ['match_footage'];
/**
 * uploading → quarantined (object finalized) → validated | rejected → ready (promoted to
 * private storage). cancelled and expired are terminal for abandoned sessions.
 */
exports.UPLOAD_STATES = [
    'uploading',
    'quarantined',
    'validated',
    'rejected',
    'ready',
    'cancelled',
    'expired',
];
exports.ACTIVE_UPLOAD_STATES = ['uploading', 'quarantined', 'validated'];
exports.REUSABLE_UPLOAD_STATES = ['uploading', 'quarantined', 'validated', 'ready'];
const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
function sanitizeFileName(value) {
    const raw = typeof value === 'string' ? value : '';
    const base = raw.split(/[\\/]/).pop() ?? '';
    const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '').trim().slice(0, 80);
    return cleaned || 'video';
}
function parseUploadRequest(data) {
    if (!exports.UPLOAD_PURPOSES.includes(data.purpose))
        return { ok: false, error: 'purpose' };
    if (typeof data.jobId !== 'string' || !JOB_ID.test(data.jobId))
        return { ok: false, error: 'job' };
    if (!exports.UPLOAD_CONTENT_TYPES.includes(data.contentType))
        return { ok: false, error: 'content_type' };
    const size = data.sizeBytes;
    if (typeof size !== 'number' || !Number.isInteger(size) || size < exports.UPLOAD_LIMITS.minBytes) {
        return { ok: false, error: 'too_small' };
    }
    if (size > exports.UPLOAD_LIMITS.maxBytes)
        return { ok: false, error: 'too_large' };
    const duration = data.declaredDurationSec;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > exports.UPLOAD_LIMITS.maxDurationSec) {
        return { ok: false, error: 'duration' };
    }
    if (typeof data.fingerprint !== 'string' || !FINGERPRINT.test(data.fingerprint))
        return { ok: false, error: 'fingerprint' };
    return {
        ok: true,
        value: {
            purpose: data.purpose,
            jobId: data.jobId,
            fileName: sanitizeFileName(data.fileName),
            contentType: data.contentType,
            sizeBytes: size,
            declaredDurationSec: Math.round(duration),
            fingerprint: data.fingerprint,
        },
    };
}
function quarantinePath(uid, uploadId) {
    return `quarantine/${uid}/${uploadId}/source`;
}
/** Parses quarantine/{uid}/{uploadId}/source; anything else is not ours. */
function parseQuarantinePath(path) {
    const match = /^quarantine\/([^/]+)\/([^/]+)\/source$/.exec(path);
    return match ? { uid: match[1], uploadId: match[2] } : null;
}
function matchFootagePath(uid, jobId) {
    return `profiles/${uid}/matchFootage/${jobId}/video.mp4`;
}
function footageMediaId(jobId) {
    return `footage_${jobId}`;
}
function isAbandoned(createdAtIso, now, days = exports.UPLOAD_LIMITS.abandonAfterDays) {
    const created = Date.parse(createdAtIso);
    return Number.isFinite(created) && now.getTime() - created > days * 86_400_000;
}
function dayKey(now) {
    return now.toISOString().slice(0, 10);
}
//# sourceMappingURL=model.js.map