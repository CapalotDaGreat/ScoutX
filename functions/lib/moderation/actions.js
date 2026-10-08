"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseExpiredSuspensions = exports.resolveAppeal = exports.submitAppeal = exports.applyModerationAction = exports.listModerationQueue = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("../callableOptions");
const notificationProducers_1 = require("../notificationProducers");
const holds_1 = require("./holds");
const model_1 = require("./model");
const reproject_1 = require("./reproject");
const staff_1 = require("./staff");
exports.listModerationQueue = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    (0, staff_1.assertStaff)(request, 'moderator');
    const db = (0, firestore_1.getFirestore)();
    const snapshot = await db.collection('moderationCases').where('open', '==', true).limit(100).get();
    const cases = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (0, model_1.comparePriority)(a.priority, b.priority) || a.createdAt.localeCompare(b.createdAt));
    return { cases };
});
const DOC_TARGETS = {
    trial: 'trialInvitations',
    evidenceRequest: 'evidenceRequests',
    scoutingReport: 'scoutingReports',
};
const NOTICE_COPY = {
    title: 'Update about your account',
    body: 'PitchProof reviewed a report. Open Settings, then Privacy Center, for details and your options.',
};
const REPORTER_COPY = {
    title: 'Your report was reviewed',
    body: 'Thank you. PitchProof reviewed your report and took the action it considered appropriate.',
};
async function notifyOwner(db, caseId, data, action) {
    if (!data.targetOwnerId)
        return;
    await db
        .collection('moderationNotices')
        .doc(data.targetOwnerId)
        .collection('items')
        .doc(caseId)
        .set({
        caseId,
        targetType: data.targetType,
        targetId: data.targetId,
        action,
        reasonCode: data.reasons[0] ?? 'other',
        appealable: (0, model_1.isModerationAction)(action) && (0, model_1.isAppealable)(action),
        at: new Date().toISOString(),
    }, { merge: true });
    await (0, notificationProducers_1.writeSystemActivity)(db, `moderation-${caseId}-${action}`, {
        recipientId: data.targetOwnerId,
        recipientRole: 'player',
        type: 'moderation_update',
        category: 'safety',
        ...NOTICE_COPY,
        reference: null,
    });
}
const PUBLIC_REPORTER_MAIL = {
    subject: 'Update on your PitchProof report',
    text: 'Thank you for your report to PitchProof. Our team has reviewed it and taken the action it considered appropriate. ' +
        'For privacy reasons we cannot share details about another person\'s account. ' +
        'If you still see a problem, you can send a new report from the same page.',
};
/** Public reporters left an email only to hear the outcome; it is deleted once used. */
async function notifyPublicReporters(db, reportIds) {
    await Promise.all(reportIds.slice(0, 20).map(async (reportId) => {
        const contactRef = db.collection('publicReporterContacts').doc(reportId);
        const email = (await contactRef.get()).get('email');
        if (typeof email !== 'string')
            return;
        await db.collection('mail').add({
            to: [email],
            message: { subject: PUBLIC_REPORTER_MAIL.subject, text: PUBLIC_REPORTER_MAIL.text },
            purpose: 'public_report_update',
            createdAt: new Date().toISOString(),
        });
        await contactRef.delete();
    }));
}
async function notifyReporters(db, caseId, reportIds) {
    await notifyPublicReporters(db, reportIds);
    const reports = await Promise.all(reportIds.slice(0, 20).map((id) => db.collection('contentReports').doc(id).get()));
    const reporters = new Set(reports.map((snap) => snap.get('reporterId')).filter((id) => typeof id === 'string' && id !== 'public'));
    await Promise.all([...reporters].map((reporterId) => (0, notificationProducers_1.writeSystemActivity)(db, `report-${caseId}-${reporterId}`, {
        recipientId: reporterId,
        recipientRole: 'player',
        type: 'report_update',
        category: 'safety',
        ...REPORTER_COPY,
        reference: null,
    })));
}
async function restrictAccount(db, uid, state, days) {
    await (0, auth_1.getAuth)().updateUser(uid, { disabled: true });
    await (0, auth_1.getAuth)().revokeRefreshTokens(uid);
    await db.collection('accountRestrictions').doc(uid).set({
        state,
        until: days ? new Date(Date.now() + days * 86400_000).toISOString() : null,
        updatedAt: new Date().toISOString(),
    });
}
async function liftAccountRestriction(db, uid) {
    const ref = db.collection('accountRestrictions').doc(uid);
    if ((await ref.get()).exists) {
        await (0, auth_1.getAuth)().updateUser(uid, { disabled: false });
        await ref.delete();
    }
}
async function removeTarget(db, data, caseId) {
    const collection = DOC_TARGETS[data.targetType];
    if (collection) {
        await db.collection(collection).doc(data.targetId).delete();
        return;
    }
    if (data.targetOwnerId &&
        (data.targetType === 'media' || data.targetType === 'reel' || data.targetType === 'external_football_source')) {
        await (0, holds_1.applyHold)({ targetType: data.targetType, targetId: data.targetId, ownerId: data.targetOwnerId, state: 'removed', caseId }, db);
    }
}
exports.applyModerationAction = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const payload = (request.data ?? {});
    const action = payload.action;
    if (!(0, model_1.isModerationAction)(action)) {
        throw new https_1.HttpsError('invalid-argument', 'Unknown action.');
    }
    const staff = (0, staff_1.assertStaff)(request, 'moderator', { recentAuth: (0, model_1.isDestructive)(action) });
    if (!(0, model_1.roleMayApply)(staff.role, action)) {
        throw new https_1.HttpsError('permission-denied', 'This action needs an admin.');
    }
    if (!(0, model_1.validReason)(payload.reason)) {
        throw new https_1.HttpsError('invalid-argument', 'A reason of at least 5 characters is required.');
    }
    const caseId = typeof payload.caseId === 'string' ? payload.caseId : '';
    const db = (0, firestore_1.getFirestore)();
    const caseRef = db.collection('moderationCases').doc(caseId);
    const snap = await caseRef.get();
    if (!caseId || !snap.exists) {
        throw new https_1.HttpsError('not-found', 'Case not found.');
    }
    const data = snap.data();
    if (!(0, model_1.isReportTargetType)(data.targetType) || !(0, model_1.actionAllowedForTarget)(action, data.targetType)) {
        throw new https_1.HttpsError('failed-precondition', 'This action does not apply to this target.');
    }
    if (data.state === 'closed') {
        throw new https_1.HttpsError('failed-precondition', 'This case is closed.');
    }
    const ownerId = data.targetOwnerId;
    const holdState = (0, model_1.holdStateFor)(action);
    if (action === 'dismiss') {
        const lifted = await (0, holds_1.clearHold)(data.targetType, data.targetId, ownerId ?? '', db);
        if (lifted && ownerId)
            await notifyOwner(db, caseId, data, 'restored');
    }
    else if (action === 'remove') {
        await removeTarget(db, data, caseId);
    }
    else if (holdState && ownerId) {
        await (0, holds_1.applyHold)({ targetType: data.targetType, targetId: data.targetId, ownerId, state: holdState, caseId }, db);
    }
    else if ((action === 'suspend' || action === 'disable') && ownerId) {
        const days = typeof payload.durationDays === 'number' && payload.durationDays > 0 ? Math.min(payload.durationDays, 365) : 7;
        await restrictAccount(db, ownerId, action === 'suspend' ? 'suspended' : 'disabled', action === 'suspend' ? days : null);
        await (0, holds_1.applyHold)({ targetType: 'user', targetId: ownerId, ownerId, state: 'hidden', caseId }, db);
    }
    const nextState = (0, model_1.caseStateAfter)(action);
    await db.collection('moderationActions').add({
        caseId,
        action,
        actorId: staff.uid,
        actorRole: staff.role,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: payload.reason,
        at: new Date().toISOString(),
    });
    await caseRef.update({
        state: nextState,
        open: nextState !== 'closed',
        decision: action === 'escalate' ? data.decision : action,
        decidedBy: action === 'escalate' ? data.decidedBy : staff.uid,
        decidedAt: new Date().toISOString(),
        ...(action === 'escalate' ? { priority: 'urgent' } : {}),
        updatedAt: new Date().toISOString(),
    });
    await (0, staff_1.writeAuditLog)(db, {
        actorId: staff.uid,
        actorRole: staff.role,
        action,
        targetType: data.targetType,
        targetId: data.targetId,
        previousState: data.state,
        newState: nextState,
        reason: payload.reason,
        caseId,
    });
    if (action !== 'dismiss' && action !== 'escalate') {
        await notifyOwner(db, caseId, data, action);
    }
    if (action !== 'escalate') {
        await notifyReporters(db, caseId, data.reportIds ?? []);
    }
    if (ownerId) {
        await (0, reproject_1.reprojectOwner)(ownerId, db).catch((error) => firebase_functions_1.logger.warn('Reprojection after moderation failed', { message: error instanceof Error ? error.message : 'unknown' }));
    }
    return { caseId, state: nextState };
});
exports.submitAppeal = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const payload = (request.data ?? {});
    const caseId = typeof payload.caseId === 'string' ? payload.caseId : '';
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!caseId || text.length < 10 || text.length > 2000) {
        throw new https_1.HttpsError('invalid-argument', 'Explain your appeal in 10 to 2000 characters.');
    }
    const db = (0, firestore_1.getFirestore)();
    const caseRef = db.collection('moderationCases').doc(caseId);
    const appealRef = db.collection('appeals').doc(caseId);
    await db.runTransaction(async (transaction) => {
        const [caseSnap, appealSnap] = await Promise.all([transaction.get(caseRef), transaction.get(appealRef)]);
        const data = caseSnap.data();
        if (!data || data.targetOwnerId !== uid) {
            throw new https_1.HttpsError('not-found', 'Case not found.');
        }
        if (!(0, model_1.canAppeal)(data.state, data.decision, appealSnap.exists)) {
            throw new https_1.HttpsError('failed-precondition', 'This decision cannot be appealed.');
        }
        const now = new Date().toISOString();
        transaction.create(appealRef, { caseId, ownerId: uid, text, state: 'open', createdAt: now });
        transaction.update(caseRef, { state: 'appealed', open: true, updatedAt: now });
        transaction.set(db.collection('moderationNotices').doc(uid).collection('items').doc(caseId), { appealStatus: 'pending', appealable: false, at: now }, { merge: true });
    });
    return { caseId, appealStatus: 'pending' };
});
exports.resolveAppeal = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const staff = (0, staff_1.assertStaff)(request, 'moderator');
    const payload = (request.data ?? {});
    const caseId = typeof payload.caseId === 'string' ? payload.caseId : '';
    const outcome = payload.outcome === 'upheld' || payload.outcome === 'overturned' ? payload.outcome : null;
    if (!caseId || !outcome || !(0, model_1.validReason)(payload.reason)) {
        throw new https_1.HttpsError('invalid-argument', 'caseId, outcome and a reason are required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const caseRef = db.collection('moderationCases').doc(caseId);
    const snap = await caseRef.get();
    const data = snap.data();
    if (!data || data.state !== 'appealed') {
        throw new https_1.HttpsError('failed-precondition', 'No open appeal for this case.');
    }
    if (data.decidedBy === staff.uid) {
        throw new https_1.HttpsError('permission-denied', 'A different staff member must review the appeal.');
    }
    if (outcome === 'overturned' && data.targetOwnerId) {
        await (0, holds_1.clearHold)(data.targetType, data.targetId, data.targetOwnerId, db);
        await (0, holds_1.clearHold)('user', data.targetOwnerId, data.targetOwnerId, db);
        await liftAccountRestriction(db, data.targetOwnerId);
    }
    const now = new Date().toISOString();
    await db.collection('appeals').doc(caseId).update({ state: outcome, resolvedBy: staff.uid, resolvedAt: now });
    await caseRef.update({ state: 'closed', open: false, appealOutcome: outcome, updatedAt: now });
    if (data.targetOwnerId) {
        await db
            .collection('moderationNotices')
            .doc(data.targetOwnerId)
            .collection('items')
            .doc(caseId)
            .set({ appealStatus: outcome, at: now }, { merge: true });
        await notifyOwner(db, caseId, data, outcome === 'upheld' ? 'appeal_upheld' : 'appeal_overturned');
        await (0, reproject_1.reprojectOwner)(data.targetOwnerId, db).catch(() => undefined);
    }
    await (0, staff_1.writeAuditLog)(db, {
        actorId: staff.uid,
        actorRole: staff.role,
        action: `appeal_${outcome}`,
        targetType: data.targetType,
        targetId: data.targetId,
        previousState: 'appealed',
        newState: 'closed',
        reason: payload.reason,
        caseId,
    });
    return { caseId, outcome };
});
/** Re-enables suspended accounts whose suspension has ended. */
exports.releaseExpiredSuspensions = (0, scheduler_1.onSchedule)('every 60 minutes', async () => {
    const db = (0, firestore_1.getFirestore)();
    const now = new Date().toISOString();
    const expired = await db.collection('accountRestrictions').where('state', '==', 'suspended').where('until', '<=', now).limit(100).get();
    for (const doc of expired.docs) {
        await (0, auth_1.getAuth)().updateUser(doc.id, { disabled: false }).catch(() => undefined);
        await (0, holds_1.clearHold)('user', doc.id, doc.id, db);
        await doc.ref.delete();
        await (0, reproject_1.reprojectOwner)(doc.id, db).catch(() => undefined);
    }
});
//# sourceMappingURL=actions.js.map