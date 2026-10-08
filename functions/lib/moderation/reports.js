"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitPublicReport = exports.onContentReportCreated = void 0;
exports.resolveTargetOwner = resolveTargetOwner;
exports.triageReport = triageReport;
exports.clientKey = clientKey;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("../callableOptions");
const core_1 = require("../footballSources/core");
const guardianToken_1 = require("../safety/guardianToken");
const userSafety_1 = require("../safety/userSafety");
const holds_1 = require("./holds");
const model_1 = require("./model");
const reproject_1 = require("./reproject");
const staff_1 = require("./staff");
/** Confirms who owns the reported target, so a reporter cannot point a case at someone else. */
async function resolveTargetOwner(db, targetType, targetId, claimedOwnerId) {
    switch (targetType) {
        case 'user':
        case 'scout':
        case 'passport':
            return (await db.collection('users').doc(targetId).get()).exists ? targetId : null;
        case 'media': {
            const media = await db.collection('players').doc(claimedOwnerId).collection('media').doc(targetId).get();
            return media.exists ? claimedOwnerId : null;
        }
        case 'reel': {
            const reel = await db.collection('reels').doc(targetId).get();
            const owner = reel.get('ownerId');
            return typeof owner === 'string' ? owner : null;
        }
        case 'trial': {
            const trial = await db.collection('trialInvitations').doc(targetId).get();
            const scout = trial.get('scoutId');
            return typeof scout === 'string' ? scout : null;
        }
        case 'evidenceRequest': {
            const request = await db.collection('evidenceRequests').doc(targetId).get();
            const scout = request.get('scoutId');
            return typeof scout === 'string' ? scout : null;
        }
        case 'scoutingReport': {
            const report = await db.collection('scoutingReports').doc(targetId).get();
            const scout = report.get('scoutId');
            return typeof scout === 'string' ? scout : null;
        }
        case 'external_football_source': {
            if (!claimedOwnerId)
                return null;
            const source = await db.collection('players').doc(claimedOwnerId).collection(core_1.FOOTBALL_SOURCES_COLLECTION).doc(targetId).get();
            return source.exists ? claimedOwnerId : null;
        }
        case 'post':
            return claimedOwnerId || null;
        default:
            return null;
    }
}
/** Groups reports per target into one open case and applies the automatic protections. */
async function triageReport(db, reportId, report) {
    if (!(0, model_1.isReportTargetType)(report.targetType) || !(0, model_1.isReportReason)(report.reason) || typeof report.targetId !== 'string') {
        return null;
    }
    const targetType = report.targetType;
    const targetId = report.targetId;
    const reason = report.reason;
    const claimed = typeof report.targetOwnerId === 'string' ? report.targetOwnerId : '';
    const ownerId = await resolveTargetOwner(db, targetType, targetId, claimed);
    const ownerIsMinor = ownerId ? (await (0, userSafety_1.loadSafetyPolicy)(ownerId, db)).isMinor : false;
    const priority = (0, model_1.priorityFor)(reason, ownerIsMinor);
    const key = (0, model_1.holdKey)(targetType, targetId);
    const now = new Date();
    // Moderators review the stored link itself; the page behind it is never fetched for them.
    let targetContext = null;
    if (targetType === 'external_football_source' && ownerId) {
        const sourceRef = db.collection('players').doc(ownerId).collection(core_1.FOOTBALL_SOURCES_COLLECTION).doc(targetId);
        const source = await sourceRef.get();
        targetContext = { providerId: String(source.get('providerId') ?? ''), url: String(source.get('url') ?? '') };
        await sourceRef.update({ reportCount: firestore_2.FieldValue.increment(1) });
    }
    const existing = await db.collection('moderationCases').where('targetKey', '==', key).where('open', '==', true).limit(1).get();
    let caseId;
    let casePriority = priority;
    if (!existing.empty) {
        const doc = existing.docs[0];
        caseId = doc.id;
        casePriority = (0, model_1.higherPriority)(doc.get('priority'), priority);
        await doc.ref.update({
            reportIds: firestore_2.FieldValue.arrayUnion(reportId),
            reasons: firestore_2.FieldValue.arrayUnion(reason),
            reportCount: firestore_2.FieldValue.increment(1),
            priority: casePriority,
            updatedAt: now.toISOString(),
        });
    }
    else {
        const ref = db.collection('moderationCases').doc();
        caseId = ref.id;
        await ref.set({
            targetType,
            targetId,
            targetKey: key,
            targetOwnerId: ownerId,
            ownerVerified: ownerId !== null,
            ownerIsMinor,
            ...(targetContext ? { targetContext } : {}),
            reasons: [reason],
            reportIds: [reportId],
            reportCount: 1,
            priority,
            state: 'triage',
            open: true,
            decision: null,
            decidedBy: null,
            reviewDueAt: new Date(now.getTime() + model_1.REVIEW_SLA_HOURS[priority] * 3600_000).toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        });
    }
    await db.collection('contentReports').doc(reportId).set({ caseId }, { merge: true });
    if (ownerId && (0, model_1.shouldAutoRestrict)(targetType, reason)) {
        await (0, holds_1.applyHold)({ targetType, targetId, ownerId, state: 'restricted', caseId }, db);
        await db.collection('moderationCases').doc(caseId).update({ state: 'restricted', autoRestricted: true });
        await (0, staff_1.writeAuditLog)(db, {
            actorId: 'system',
            actorRole: 'system',
            action: 'auto_restrict',
            targetType,
            targetId,
            previousState: null,
            newState: 'restricted',
            reason: `Automatic restriction while a "${reason}" report is reviewed.`,
            caseId,
        });
        await (0, reproject_1.reprojectOwner)(ownerId, db).catch((error) => firebase_functions_1.logger.warn('Reprojection after auto-restrict failed', {
            message: error instanceof Error ? error.message : 'unknown',
        }));
    }
    return caseId;
}
exports.onContentReportCreated = (0, firestore_1.onDocumentCreated)('contentReports/{reportId}', async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    try {
        await triageReport((0, firestore_2.getFirestore)(), event.params.reportId, data);
    }
    catch (error) {
        firebase_functions_1.logger.error('Report triage failed', { message: error instanceof Error ? error.message : 'unknown' });
        throw error;
    }
});
const PUBLIC_REASONS = ['appears_in_video', 'minor_in_video', 'privacy', 'copyright', 'safety_concern'];
const PUBLIC_DAILY_LIMIT = 5;
/** Behind the Hosting rewrite the client address is the first x-forwarded-for entry. */
function clientKey(forwardedFor, ip) {
    const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const client = header?.split(',')[0]?.trim() || ip || 'unknown';
    return (0, node_crypto_1.createHash)('sha256').update(`public-report:${client}`).digest('hex').slice(0, 32);
}
/**
 * No-account report from the Hosting form, for people who appear in a video. Rate-limited per
 * client; the form also carries a honeypot. App Check for the web form is external configuration.
 */
exports.submitPublicReport = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ enforceAppCheck: false }), async (request) => {
    const data = (request.data ?? {});
    if (typeof data.website === 'string' && data.website.length > 0) {
        return { received: true };
    }
    const passport = typeof data.passport === 'string' ? data.passport.trim() : '';
    const slugMatch = /(?:\/player\/)?([a-z0-9][a-z0-9-]{1,40})\/?$/i.exec(passport);
    const reason = data.reason;
    const details = typeof data.details === 'string' ? data.details.trim().slice(0, 1000) : '';
    const relationship = data.relationship === 'self' || data.relationship === 'guardian' ? data.relationship : 'other';
    if (!slugMatch || !(0, model_1.isReportReason)(reason) || !PUBLIC_REASONS.includes(reason) || details.length < 10) {
        throw new https_1.HttpsError('invalid-argument', 'Passport link, reason and a short description are required.');
    }
    const contact = (0, guardianToken_1.isPlausibleEmail)(data.contactEmail) ? data.contactEmail.trim().toLowerCase() : null;
    const db = (0, firestore_2.getFirestore)();
    const limitRef = db.collection('publicReportLimits').doc(`${clientKey(request.rawRequest?.headers['x-forwarded-for'], request.rawRequest?.ip)}_${new Date().toISOString().slice(0, 10)}`);
    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(limitRef);
        const count = snap.get('count') ?? 0;
        if (count >= PUBLIC_DAILY_LIMIT) {
            throw new https_1.HttpsError('resource-exhausted', 'Too many reports today. Please try again tomorrow.');
        }
        transaction.set(limitRef, { count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
    });
    const slug = await db.collection('portfolioSlugs').doc(slugMatch[1].toLowerCase()).get();
    const playerId = slug.get('playerId');
    if (typeof playerId !== 'string') {
        throw new https_1.HttpsError('not-found', 'We could not find that Passport. Check the link and try again.');
    }
    const reportRef = db.collection('contentReports').doc();
    await reportRef.set({
        reporterId: 'public',
        targetType: 'passport',
        targetId: playerId,
        targetOwnerId: playerId,
        reason,
        details: `[${relationship}] ${details}`,
        source: 'public_form',
        createdAt: new Date().toISOString(),
    });
    if (contact) {
        await db.collection('publicReporterContacts').doc(reportRef.id).set({ email: contact, createdAt: new Date().toISOString() });
    }
    return { received: true };
});
//# sourceMappingURL=reports.js.map