"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectVideoSource = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const callableOptions_1 = require("../callableOptions");
const quotaService_1 = require("../entitlements/quotaService");
const rateLimit_1 = require("../security/rateLimit");
const videoProviders_1 = require("./videoProviders");
/**
 * "Import from link" step 1: recognise and validate a video link for the signed-in user.
 * The validated media URL never leaves the server; the app receives provider, status,
 * permitted metadata and (for Veo) actionable export steps.
 */
exports.inspectVideoSource = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ timeoutSeconds: 30 }), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in to import a video.');
    const url = request.data?.url;
    if (typeof url !== 'string' || url.length > 2048)
        throw new https_1.HttpsError('invalid-argument', 'Provide a video link.');
    await (0, rateLimit_1.assertCallableRateLimit)(uid, rateLimit_1.VIDEO_SOURCE_INSPECT_LIMIT);
    const plan = await (0, quotaService_1.planFor)((0, firestore_1.getFirestore)(), uid);
    const result = await (0, videoProviders_1.inspectSource)(url, { maxBytes: plan.maxVideoBytes });
    const { mediaUrl: _hidden, ...safe } = result;
    return { ...safe, maxVideoBytes: plan.maxVideoBytes, maxVideoDurationSec: plan.maxVideoDurationSec };
});
//# sourceMappingURL=videoSourceCallable.js.map