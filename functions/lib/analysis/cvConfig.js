"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cvWorkerUrl = cvWorkerUrl;
exports.cvWorkerStatus = cvWorkerStatus;
exports.cvEventsValidated = cvEventsValidated;
function isEmulated(env) {
    return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
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
    return env.CV_WORKER_APPROVED?.trim() === 'true' ? 'available' : 'not_approved';
}
function cvEventsValidated(env = process.env) {
    return cvWorkerStatus(env) === 'available' && env.CV_EVENTS_VALIDATED?.trim() === 'true';
}
//# sourceMappingURL=cvConfig.js.map