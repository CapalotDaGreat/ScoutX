"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELD_COLLECTION = exports.PILOT_DOC = exports.PILOT_COLLECTION = void 0;
exports.pilotGateBypassed = pilotGateBypassed;
exports.parsePilotConfig = parsePilotConfig;
exports.decidePilot = decidePilot;
exports.readPilot = readPilot;
exports.pilotDecision = pilotDecision;
exports.releaseHeldReport = releaseHeldReport;
exports.withholdPublishedReport = withholdPublishedReport;
const cvConfig_1 = require("./cvConfig");
/**
 * Pilot gate for full-match tracking (2026-11-19). Fail-closed runtime control that sits on top of
 * TRACKING_V3_ENABLED and the CV worker approval:
 *
 *   opsConfig/trackingPilot  { enabled: true, allowlist: [uid, ...], workerVersion: '<approved>', holdReports?: boolean }
 *
 * - Missing or malformed document, enabled !== true, owner not listed, or a worker version different from the
 *   compiled approval: the job is not started, no worker call is made, and nothing is published.
 * - Read at run time by every task (not an environment variable), so flipping `enabled` to false is a kill switch
 *   that also reaches in-flight jobs: queued tasks stop, and a worker result that returns after the stop is
 *   discarded inside the publishing transaction.
 * - holdReports (default true): a finished report is written to the owner-unreadable `pilotHeld/current` instead of
 *   `tracking/current`, and no completion notification is sent, until a reviewer releases it with
 *   releaseHeldReport(). withholdPublishedReport() moves an already published report back under hold. Owner
 *   corrections (tracking/feedback) are never touched.
 * - The document is server-only (firestore.rules has no client read or write for opsConfig).
 * Test seam: TRACKING_PILOT_GATE=off is honoured only under the emulators, never in a deployed function.
 */
exports.PILOT_COLLECTION = 'opsConfig';
exports.PILOT_DOC = 'trackingPilot';
exports.HELD_COLLECTION = 'pilotHeld';
function isEmulated(env) {
    return env.FUNCTIONS_EMULATOR === 'true' || Boolean(env.FIRESTORE_EMULATOR_HOST);
}
function pilotGateBypassed(env = process.env) {
    return isEmulated(env) && env.TRACKING_PILOT_GATE?.trim() === 'off';
}
function parsePilotConfig(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const r = raw;
    if (typeof r.enabled !== 'boolean' || !Array.isArray(r.allowlist) || typeof r.workerVersion !== 'string')
        return null;
    if (!r.allowlist.every((u) => typeof u === 'string' && u.length > 0))
        return null;
    if (r.holdReports !== undefined && typeof r.holdReports !== 'boolean')
        return null;
    return { enabled: r.enabled, allowlist: r.allowlist, workerVersion: r.workerVersion,
        holdReports: r.holdReports !== false };
}
function decidePilot(cfg, uid, env = process.env) {
    if (pilotGateBypassed(env))
        return 'allowed';
    if (!cfg)
        return 'missing_config';
    if (cfg.enabled !== true)
        return 'pilot_off';
    if (!cfg.allowlist.includes(uid))
        return 'not_allowlisted';
    const approval = (0, cvConfig_1.cvApproval)(env);
    if (!approval || cfg.workerVersion !== approval.workerVersion)
        return 'version_mismatch';
    return 'allowed';
}
function pilotRef(db) {
    return db.collection(exports.PILOT_COLLECTION).doc(exports.PILOT_DOC);
}
async function readPilot(db, tx) {
    const snap = tx ? await tx.get(pilotRef(db)) : await pilotRef(db).get();
    return snap.exists ? parsePilotConfig(snap.data()) : null;
}
async function pilotDecision(db, uid, env = process.env, tx) {
    if (pilotGateBypassed(env))
        return { decision: 'allowed', hold: false };
    const cfg = await readPilot(db, tx);
    return { decision: decidePilot(cfg, uid, env), hold: cfg?.holdReports !== false };
}
/** Reviewer action: publish a held report to the owner (no notification is sent here). */
async function releaseHeldReport(db, matchCollection, trackingCollection, jobId, reviewer, now = () => new Date()) {
    const job = db.collection(matchCollection).doc(jobId);
    const held = job.collection(exports.HELD_COLLECTION).doc('current');
    const current = job.collection(trackingCollection).doc('current');
    return db.runTransaction(async (tx) => {
        const h = await tx.get(held);
        const cur = await tx.get(current);
        if (!h.exists || !h.get('report'))
            return 'nothing_held';
        const at = now().toISOString();
        tx.set(current, { ...h.data(), version: (cur.get('version') ?? 0) + 1, releasedAt: at,
            releasedBy: reviewer });
        tx.set(held, { report: null, releasedAt: at, releasedBy: reviewer }, { merge: true });
        return 'released';
    });
}
/** Containment: take an already published report away from the owner and keep it under hold with a reason. */
async function withholdPublishedReport(db, matchCollection, trackingCollection, jobId, reason, now = () => new Date()) {
    const job = db.collection(matchCollection).doc(jobId);
    const held = job.collection(exports.HELD_COLLECTION).doc('current');
    const current = job.collection(trackingCollection).doc('current');
    return db.runTransaction(async (tx) => {
        const cur = await tx.get(current);
        if (!cur.exists || !cur.get('report'))
            return 'nothing_published';
        const at = now().toISOString();
        tx.set(held, { ...cur.data(), withheldAt: at, withheldReason: reason });
        tx.set(current, { report: null, version: (cur.get('version') ?? 0) + 1, stale: true,
            pendingReason: 'withheld_for_review', feedbackRevision: cur.get('feedbackRevision') ?? 0, updatedAt: at });
        return 'withheld';
    });
}
//# sourceMappingURL=pilotGate.js.map