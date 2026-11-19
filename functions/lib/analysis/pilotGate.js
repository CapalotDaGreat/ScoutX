"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELD_COLLECTION = exports.PILOT_DOC = exports.PILOT_COLLECTION = void 0;
exports.pilotGateBypassed = pilotGateBypassed;
exports.parsePilotConfig = parsePilotConfig;
exports.decidePilot = decidePilot;
exports.readPilot = readPilot;
exports.pilotDecision = pilotDecision;
exports.authorizeRun = authorizeRun;
exports.releaseHeldReport = releaseHeldReport;
exports.withholdPublishedReport = withholdPublishedReport;
const cvConfig_1 = require("./cvConfig");
const trackingImages_1 = require("./trackingImages");
/**
 * Pilot gate for full-match tracking (2026-11-19). Fail-closed runtime control that sits on top of
 * TRACKING_V3_ENABLED and the CV worker approval:
 *
 *   opsConfig/trackingPilot  { enabled: true, allowlist: [uid, ...], workerVersion: '<approved>', holdReports?: boolean,
 *                              enabledAt: '<ISO time of this enable>' }
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
 * - enabledAt (required while enabled) starts an authorisation epoch (2026-11-19 rehearsal): a job records
 *   pilotAuthorizedAt when it is started (or re-authorised by an operator), and every task refuses work whose
 *   authorisation predates the current enable ('stale_authorization'). A delivery queued before a stop can therefore
 *   never run as if it were new work after the pilot is enabled again; the owner restarts, or an operator reprocesses.
 * - Discovery sightings follow the same hold as reports (pilotHeld/discovery) and the same in-transaction stop.
 * - A withheld (contained) report cannot be released as is; it must be reprocessed under a current authorisation.
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
    const enabledAt = typeof r.enabledAt === 'string' && !Number.isNaN(Date.parse(r.enabledAt)) ? r.enabledAt : null;
    // An enable without its epoch is malformed: fail closed rather than authorise every earlier delivery.
    if (r.enabled === true && !enabledAt)
        return null;
    return { enabled: r.enabled, allowlist: r.allowlist, workerVersion: r.workerVersion,
        holdReports: r.holdReports !== false, enabledAt };
}
/**
 * `run` is passed by tasks that continue an already started job: its pilotAuthorizedAt must not predate the
 * current enable. Starting a job (no `run`) is authorised by the current enable itself.
 */
function decidePilot(cfg, uid, env = process.env, run) {
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
    if (run && (!run.authorizedAt || !cfg.enabledAt || Date.parse(run.authorizedAt) < Date.parse(cfg.enabledAt)))
        return 'stale_authorization';
    return 'allowed';
}
function pilotRef(db) {
    return db.collection(exports.PILOT_COLLECTION).doc(exports.PILOT_DOC);
}
async function readPilot(db, tx) {
    const snap = tx ? await tx.get(pilotRef(db)) : await pilotRef(db).get();
    return snap.exists ? parsePilotConfig(snap.data()) : null;
}
async function pilotDecision(db, uid, env = process.env, tx, run) {
    if (pilotGateBypassed(env))
        return { decision: 'allowed', hold: false };
    const cfg = await readPilot(db, tx);
    return { decision: decidePilot(cfg, uid, env, run), hold: cfg?.holdReports !== false };
}
/** Operator: re-authorise an existing job under the current enable (used before verified reprocessing). */
async function authorizeRun(db, matchCollection, trackingCollection, jobId, now = () => new Date(), env = process.env) {
    const job = db.collection(matchCollection).doc(jobId);
    const progress = job.collection(trackingCollection).doc('progress');
    return db.runTransaction(async (tx) => {
        const j = await tx.get(job);
        const p = await tx.get(progress);
        if (!j.exists || !p.exists)
            return 'no_progress';
        // Enabled and allowlisted; the worker version is checked again by every task that does the work.
        if (!pilotGateBypassed(env)) {
            const cfg = await readPilot(db, tx);
            if (!cfg)
                return 'missing_config';
            if (!cfg.enabled)
                return 'pilot_off';
            if (!cfg.allowlist.includes(String(j.get('playerId'))))
                return 'not_allowlisted';
        }
        const at = now().toISOString();
        tx.set(progress, { pilotAuthorizedAt: at, outcome: null, blocked: null, resolving: null, updatedAt: at }, { merge: true });
        return 'authorized';
    });
}
/** Reviewer action: publish a held report to the owner (no notification is sent here). */
async function releaseHeldReport(db, matchCollection, trackingCollection, jobId, reviewer, now = () => new Date(), images = null) {
    const job = db.collection(matchCollection).doc(jobId);
    let releasedDocs = [];
    const held = job.collection(exports.HELD_COLLECTION).doc('current');
    const current = job.collection(trackingCollection).doc('current');
    const heldDiscovery = job.collection(exports.HELD_COLLECTION).doc('discovery');
    const discovery = job.collection(trackingCollection).doc('discovery');
    const result = await db.runTransaction(async (tx) => {
        const h = await tx.get(held);
        const cur = await tx.get(current);
        const hd = await tx.get(heldDiscovery);
        if (!h.exists || !h.get('report')) {
            if (!hd.exists || !hd.get('moments'))
                return 'nothing_held';
        }
        else if (h.get('withheldAt')) {
            // A contained report goes back to the owner only through reprocessing under a current authorisation.
            return 'withheld_requires_reprocess';
        }
        const at = now().toISOString();
        releasedDocs = [h.exists && h.get('report') ? h.data() : null, hd.exists && !hd.get('withheldAt') ? hd.data() : null];
        if (h.exists && h.get('report')) {
            tx.set(current, { ...h.data(), version: (cur.get('version') ?? 0) + 1, releasedAt: at,
                releasedBy: reviewer });
            tx.set(held, { report: null, releasedAt: at, releasedBy: reviewer }, { merge: true });
        }
        if (hd.exists && hd.get('moments') && !hd.get('withheldAt')) {
            tx.set(discovery, { moments: hd.get('moments'), generation: hd.get('generation') ?? null, updatedAt: at, releasedAt: at });
            tx.set(heldDiscovery, { moments: null, releasedAt: at, releasedBy: reviewer }, { merge: true });
        }
        return 'released';
    });
    // R2: the released report's images become owner-readable only now (held twins -> owner paths).
    if (result === 'released' && images)
        await (0, trackingImages_1.publishImages)(images, (0, trackingImages_1.referencedImagePaths)(...releasedDocs));
    return result;
}
/** Containment: take an already published report away from the owner and keep it under hold with a reason. */
async function withholdPublishedReport(db, matchCollection, trackingCollection, jobId, reason, now = () => new Date(), images = null) {
    const job = db.collection(matchCollection).doc(jobId);
    // R2: close the image paths first, so no image outlives the report's visibility; undone if nothing was published.
    let contained = new Set();
    if (images) {
        const [c, d] = await Promise.all([job.collection(trackingCollection).doc('current').get(), job.collection(trackingCollection).doc('discovery').get()]);
        contained = (0, trackingImages_1.referencedImagePaths)(c.data() ?? null, d.data() ?? null);
        await (0, trackingImages_1.containImages)(images, contained);
    }
    const held = job.collection(exports.HELD_COLLECTION).doc('current');
    const current = job.collection(trackingCollection).doc('current');
    const discovery = job.collection(trackingCollection).doc('discovery');
    const heldDiscovery = job.collection(exports.HELD_COLLECTION).doc('discovery');
    const result = await db.runTransaction(async (tx) => {
        const cur = await tx.get(current);
        const disc = await tx.get(discovery);
        if ((!cur.exists || !cur.get('report')) && !(disc.exists && disc.get('moments')))
            return 'nothing_published';
        const at = now().toISOString();
        if (disc.exists && disc.get('moments')) {
            tx.set(heldDiscovery, { ...disc.data(), withheldAt: at, withheldReason: reason });
            tx.delete(discovery);
        }
        if (!cur.exists || !cur.get('report'))
            return 'withheld';
        tx.set(held, { ...cur.data(), withheldAt: at, withheldReason: reason });
        tx.set(current, { report: null, version: (cur.get('version') ?? 0) + 1, stale: true,
            pendingReason: 'withheld_for_review', feedbackRevision: cur.get('feedbackRevision') ?? 0, updatedAt: at });
        return 'withheld';
    });
    if (result !== 'withheld' && images)
        await (0, trackingImages_1.publishImages)(images, contained);
    return result;
}
//# sourceMappingURL=pilotGate.js.map