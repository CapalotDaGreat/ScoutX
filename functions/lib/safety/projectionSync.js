"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserSafetyWrittenReproject = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const discoveryProjection_1 = require("../discoveryProjection");
const publicPassport_1 = require("../publicPassport");
/** Age band or guardian scope changes immediately add or withdraw public projections. */
exports.onUserSafetyWrittenReproject = (0, firestore_2.onDocumentWritten)('userSafety/{uid}', async (event) => {
    const uid = event.params.uid;
    const profile = await (0, firestore_1.getFirestore)().collection('profiles').doc(uid).get();
    await (0, publicPassport_1.projectPassport)(uid, profile.exists ? profile.data() : undefined);
    await (0, discoveryProjection_1.projectDiscoverablePlayer)(uid);
});
//# sourceMappingURL=projectionSync.js.map