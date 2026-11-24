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
function trackingReaderRequest(input) {
    const d = input;
    if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some((k) => !['jobId', 'readerEncoding'].includes(k))
        || typeof d.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(d.jobId)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid tracking read request.');
    }
    if (d.readerEncoding !== trackingStorage_1.TRACKING_STORAGE_ENCODING) {
        throw new https_1.HttpsError('failed-precondition', 'A compatible tracking reader is required.', { reason: 'tracking_reader_upgrade_required' });
    }
    return { jobId: d.jobId };
}
/** Explicit protocol opt-in, never an account-wide/device-wide compatibility claim. */
async function readCompatibleTracking(db, uid, input) {
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    const { jobId } = trackingReaderRequest(input);
    return db.runTransaction(async (tx) => {
        const job = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId);
        const owner = await tx.get(job);
        if (!owner.exists || owner.get('playerId') !== uid)
            throw new https_1.HttpsError('permission-denied', 'Analysis unavailable.');
        const [current, discovery] = await Promise.all([
            tx.get(job.collection(trackingV3_1.TRACKING_COLLECTION).doc('current')),
            tx.get(job.collection(trackingV3_1.TRACKING_COLLECTION).doc('discovery')),
        ]);
        try {
            return { readerEncoding: trackingStorage_1.TRACKING_STORAGE_ENCODING,
                current: current.exists ? (0, trackingStorage_1.decodeTrackingStorage)(current.data()) : null,
                discovery: discovery.exists ? (0, trackingStorage_1.decodeTrackingStorage)(discovery.data()) : null };
        }
        catch {
            throw new https_1.HttpsError('failed-precondition', 'Tracking storage cannot be read.', { reason: 'tracking_storage_invalid' });
        }
    });
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