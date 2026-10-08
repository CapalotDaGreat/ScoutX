"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onFootballSourceWrittenReproject = exports.removeExternalFootballSource = exports.updateExternalFootballSource = exports.addExternalFootballSource = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("../callableOptions");
const reproject_1 = require("../moderation/reproject");
const core_1 = require("./core");
const service_1 = require("./service");
function requireUid(request) {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    return uid;
}
function payload(request) {
    return request.data && typeof request.data === 'object' ? request.data : {};
}
exports.addExternalFootballSource = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = requireUid(request);
    const source = await (0, service_1.addFootballSource)((0, firestore_2.getFirestore)(), uid, payload(request));
    firebase_functions_1.logger.info('Football source added', (0, core_1.footballSourceLogContext)(source));
    return { source };
});
exports.updateExternalFootballSource = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = requireUid(request);
    return { source: await (0, service_1.updateFootballSource)((0, firestore_2.getFirestore)(), uid, payload(request)) };
});
exports.removeExternalFootballSource = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = requireUid(request);
    await (0, service_1.removeFootballSource)((0, firestore_2.getFirestore)(), uid, payload(request));
    return { removed: true };
});
const PUBLIC_FIELDS = ['visibility', 'status', 'url', 'providerId', 'sourceType'];
/** Passport and scout copies are rebuilt whenever a link is added, removed, hidden or reshared. */
exports.onFootballSourceWrittenReproject = (0, firestore_1.onDocumentWritten)(`players/{uid}/${core_1.FOOTBALL_SOURCES_COLLECTION}/{sourceId}`, async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    if (PUBLIC_FIELDS.every((field) => before[field] === after[field]))
        return;
    try {
        await (0, reproject_1.reprojectOwner)(event.params.uid);
    }
    catch (error) {
        firebase_functions_1.logger.error('Football source reprojection failed', { message: error instanceof Error ? error.message : 'unknown' });
        throw error;
    }
});
//# sourceMappingURL=callables.js.map