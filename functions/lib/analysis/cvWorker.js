"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notAvailableCvWorker = void 0;
exports.getCvWorker = getCvWorker;
exports.setCvWorker = setCvWorker;
exports.identityToken = identityToken;
exports.createHttpCvClient = createHttpCvClient;
exports.setCvSegmentClient = setCvSegmentClient;
exports.getCvSegmentClient = getCvSegmentClient;
const workerContract_1 = require("./workerContract");
const cvConfig_1 = require("./cvConfig");
const cvContract_1 = require("./cvContract");
exports.notAvailableCvWorker = {
    id: 'not_available',
    available: false,
    run: async () => (0, workerContract_1.unavailableCvOutputs)(),
};
let activeWorker = exports.notAvailableCvWorker;
function getCvWorker() {
    return activeWorker;
}
function setCvWorker(worker) {
    activeWorker = worker;
}
const CV_TIMEOUT_MS = 10 * 60 * 1000;
const METADATA_IDENTITY_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
/** Google-signed ID token for the worker's Cloud Run audience (private service, IAM invoker). */
async function identityToken(audience) {
    try {
        const response = await fetch(`${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`, {
            headers: { 'Metadata-Flavor': 'Google' },
            signal: AbortSignal.timeout(5000),
        });
        return response.ok ? (await response.text()).trim() : null;
    }
    catch {
        return null;
    }
}
function createHttpCvClient(baseUrl, env = process.env) {
    return {
        async analyzeSegment(request) {
            const emulated = env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
            const token = emulated ? null : await identityToken(baseUrl);
            if (!emulated && !token)
                return null;
            try {
                const response = await fetch(`${baseUrl}/v2/segments:analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: JSON.stringify(request),
                    signal: AbortSignal.timeout(CV_TIMEOUT_MS),
                });
                if (!response.ok)
                    return null;
                return (0, cvContract_1.parseCvSegmentResult)(await response.json(), {
                    segmentIndex: request.segmentIndex,
                    startSec: request.startSec,
                    endSec: request.endSec,
                });
            }
            catch {
                return null;
            }
        },
    };
}
let segmentClientOverride = null;
function setCvSegmentClient(client) {
    segmentClientOverride = client;
}
/**
 * The configured worker, or null until CV_WORKER_URL / CV_WORKER_APPROVED are set and a
 * verified evaluation approval is compiled in. Output from any other build is discarded.
 */
function getCvSegmentClient(env = process.env) {
    if ((0, cvConfig_1.cvWorkerStatus)(env) !== 'available')
        return null;
    const url = (0, cvConfig_1.cvWorkerUrl)(env);
    const client = segmentClientOverride ?? (url ? createHttpCvClient(url, env) : null);
    if (!client)
        return null;
    return {
        async analyzeSegment(request) {
            const result = await client.analyzeSegment(request);
            return result && (0, cvConfig_1.isApprovedWorkerOutput)(result, env) ? result : null;
        },
    };
}
//# sourceMappingURL=cvWorker.js.map