"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTrackingStorageV1 = void 0;
exports.trackingReaderRequest = trackingReaderRequest;
exports.readCompatibleTracking = readCompatibleTracking;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const callableOptions_1 = require("../callableOptions");
const rateLimit_1 = require("../security/rateLimit");
const trackingStorage_1 = require("./trackingStorage");
const frameAnalysis_1 = require("./frameAnalysis");
const trackingV3_1 = require("./trackingV3");
const SLOTS = ['current', 'discovery'];
const UPDATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function invalid() {
    throw new https_1.HttpsError('invalid-argument', 'Invalid tracking read request.');
}
function trackingReaderRequest(input) {
    const d = input;
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some((key) => !['jobId', 'readerEncoding', 'documents', 'since'].includes(key))
        || typeof d.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(d.jobId))
        invalid();
    if (d.readerEncoding !== trackingStorage_1.TRACKING_STORAGE_ENCODING) {
        throw new https_1.HttpsError('failed-precondition', 'A compatible tracking reader is required.', { reason: 'tracking_reader_upgrade_required' });
    }
    const requested = d.documents === undefined ? [...SLOTS] : d.documents;
    if (!Array.isArray(requested) || requested.length < 1 || requested.length > SLOTS.length || new Set(requested).size !== requested.length
        || requested.some((slot) => !SLOTS.includes(slot)))
        invalid();
    const documents = SLOTS.filter((slot) => requested.includes(slot));
    const since = {};
    if (d.since !== undefined) {
        if (!d.since || typeof d.since !== 'object' || Array.isArray(d.since))
            invalid();
        const source = d.since;
        if (Object.keys(source).some((key) => key !== 'current' && key !== 'discovery'))
            invalid();
        for (const slot of SLOTS) {
            if (source[slot] === undefined)
                continue;
            if (!documents.includes(slot) || typeof source[slot] !== 'string' || !UPDATED_AT.test(source[slot]))
                invalid();
            since[slot] = source[slot];
        }
    }
    return { jobId: d.jobId, documents, since };
}
/**
 * Owner-checked snapshot of the requested tracking documents.
 * Read-only so a poll does not lock the documents the worker writes.
 * A matching updatedAt returns no document body.
 */
async function readCompatibleTracking(db, uid, input) {
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    const { jobId, documents, since } = trackingReaderRequest(input);
    return db.runTransaction(async (tx) => {
        const job = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
        const owner = await tx.get(job);
        if (!owner.exists || owner.get('playerId') !== uid)
            throw new https_1.HttpsError('permission-denied', 'Analysis unavailable.');
        const out = { readerEncoding: trackingStorage_1.TRACKING_STORAGE_ENCODING };
        const unchanged = {};
        for (const slot of documents) {
            const snap = await tx.get(job.collection(trackingV3_1.TRACKING_COLLECTION).doc(slot));
            if (!snap.exists) {
                out[slot] = null;
                continue;
            }
            const stored = snap.data() ?? {};
            if (typeof stored.updatedAt === 'string' && since[slot] === stored.updatedAt && UPDATED_AT.test(stored.updatedAt)) {
                unchanged[slot] = true;
                continue;
            }
            try {
                out[slot] = (0, trackingStorage_1.decodeTrackingStorage)(stored);
            }
            catch {
                throw new https_1.HttpsError('failed-precondition', 'Tracking storage cannot be read.', { reason: 'tracking_storage_invalid' });
            }
        }
        if (unchanged.current || unchanged.discovery)
            out.unchanged = unchanged;
        return out;
    }, { readOnly: true });
}
exports.readTrackingStorageV1 = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ timeoutSeconds: 30, maxInstances: 5 }), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    trackingReaderRequest(request.data);
    await (0, rateLimit_1.assertCallableRateLimit)(uid, { action: 'tracking_reader_v1', max: 1200, window: 'hour' });
    return readCompatibleTracking((0, firestore_1.getFirestore)(), uid, request.data);
});
//# sourceMappingURL=trackingReader.js.map