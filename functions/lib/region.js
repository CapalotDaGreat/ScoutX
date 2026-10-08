"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FUNCTIONS_REGION = void 0;
exports.taskQueueName = taskQueueName;
const v2_1 = require("firebase-functions/v2");
/** Same region as the Firestore database and Storage bucket, so personal data stays in Switzerland. */
exports.FUNCTIONS_REGION = 'europe-west6';
(0, v2_1.setGlobalOptions)({ region: exports.FUNCTIONS_REGION });
/** Admin SDK task queues default to us-central1 unless the full resource path is given. */
function taskQueueName(functionName) {
    return `locations/${exports.FUNCTIONS_REGION}/functions/${functionName}`;
}
//# sourceMappingURL=region.js.map