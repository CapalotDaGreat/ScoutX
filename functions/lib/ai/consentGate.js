"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAiConsent = assertAiConsent;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const consent_1 = require("../legal/consent");
/**
 * AI processing needs a current `ai_analysis` consent from the requester and, when someone
 * else's data is analysed, from that person too. Withdrawn consent stops new AI runs.
 */
async function assertAiConsent(uids, db = (0, firestore_1.getFirestore)()) {
    const [requester, ...subjects] = [...new Set(uids)];
    if (requester && !(await (0, consent_1.hasCurrentConsent)(requester, 'ai_analysis', db))) {
        throw new https_1.HttpsError('failed-precondition', 'Turn on AI analysis in the Privacy Center to use this feature.', {
            reason: 'ai_consent_required',
        });
    }
    for (const subject of subjects) {
        if (!(await (0, consent_1.hasCurrentConsent)(subject, 'ai_analysis', db))) {
            throw new https_1.HttpsError('failed-precondition', 'This player has not enabled AI analysis.', {
                reason: 'subject_ai_consent_missing',
            });
        }
    }
}
//# sourceMappingURL=consentGate.js.map