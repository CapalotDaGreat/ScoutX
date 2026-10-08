"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEmulatorCvApproval = setEmulatorCvApproval;
exports.cvApproval = cvApproval;
exports.cvWorkerUrl = cvWorkerUrl;
exports.cvWorkerStatus = cvWorkerStatus;
exports.cvEventsValidated = cvEventsValidated;
exports.isApprovedWorkerOutput = isApprovedWorkerOutput;
const cvApproval_generated_1 = require("./cvApproval.generated");
function isEmulated(env) {
    return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
}
let emulatorApproval = null;
/** Test seam: honoured only under the emulators, never in a deployed function. */
function setEmulatorCvApproval(approval) {
    emulatorApproval = approval;
}
function cvApproval(env = process.env) {
    if (cvApproval_generated_1.APPROVED_CV_WORKER)
        return cvApproval_generated_1.APPROVED_CV_WORKER;
    return isEmulated(env) ? emulatorApproval : null;
}
function cvWorkerUrl(env = process.env) {
    const raw = env.CV_WORKER_URL?.trim();
    if (!raw)
        return null;
    if (raw.startsWith('https://'))
        return raw.replace(/\/+$/, '');
    return isEmulated(env) && raw.startsWith('http://') ? raw.replace(/\/+$/, '') : null;
}
function cvWorkerStatus(env = process.env) {
    if (!cvWorkerUrl(env))
        return 'not_configured';
    if (env.CV_WORKER_APPROVED?.trim() !== 'true')
        return 'not_approved';
    return cvApproval(env) ? 'available' : 'not_evaluated';
}
function cvEventsValidated(env = process.env) {
    return (cvWorkerStatus(env) === 'available' &&
        env.CV_EVENTS_VALIDATED?.trim() === 'true' &&
        cvApproval(env)?.eventsApproved === true);
}
/** A response from any other worker build or model set than the evaluated one is discarded. */
function isApprovedWorkerOutput(output, env = process.env) {
    const approval = cvApproval(env);
    if (!approval || output.workerVersion !== approval.workerVersion)
        return false;
    const expected = Object.entries(approval.models);
    return (expected.length > 0 &&
        expected.length === Object.keys(output.models).length &&
        expected.every(([key, value]) => output.models[key] === value));
}
//# sourceMappingURL=cvConfig.js.map