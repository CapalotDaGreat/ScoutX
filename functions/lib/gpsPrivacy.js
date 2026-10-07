"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeLegacyGpsLocation = exports.LEGACY_GPS_FIELDS = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
/** Fields written by builds that stored location; none may remain on a session document. */
exports.LEGACY_GPS_FIELDS = ['pointsStorageKey', 'heatmap.bounds'];
/**
 * Removes location data written before GPS processing moved fully on-device: every
 * `gpsSessions/{uid}/...` object (raw point tracks) and coordinate fields on the caller's
 * session documents. Idempotent; safe to call repeatedly.
 */
exports.purgeLegacyGpsLocation = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const sessions = await db.collection('gpsSessions').where('playerId', '==', uid).get();
    let documentsCleaned = 0;
    let batch = db.batch();
    let pending = 0;
    for (const session of sessions.docs) {
        const data = session.data();
        const heatmap = data.heatmap;
        if (!('pointsStorageKey' in data) && !(heatmap && 'bounds' in heatmap)) {
            continue;
        }
        batch.update(session.ref, {
            pointsStorageKey: firestore_1.FieldValue.delete(),
            'heatmap.bounds': firestore_1.FieldValue.delete(),
        });
        documentsCleaned += 1;
        pending += 1;
        if (pending === 400) {
            await batch.commit();
            batch = db.batch();
            pending = 0;
        }
    }
    if (pending > 0) {
        await batch.commit();
    }
    let filesDeleted = 0;
    try {
        const [files] = await (0, storage_1.getStorage)().bucket().getFiles({ prefix: `gpsSessions/${uid}/` });
        await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
        filesDeleted = files.length;
    }
    catch (error) {
        firebase_functions_1.logger.error('Legacy GPS file purge failed', { uid, error: String(error) });
        throw new https_1.HttpsError('internal', 'Could not remove stored GPS files. Try again later.');
    }
    firebase_functions_1.logger.info('Legacy GPS location purged', { uid, documentsCleaned, filesDeleted });
    return { documentsCleaned, filesDeleted };
});
//# sourceMappingURL=gpsPrivacy.js.map