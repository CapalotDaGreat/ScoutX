"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDevelopmentReminders = exports.onTrialInvitationUpdatedNotify = exports.onPassportSummaryWrittenNotifyOwner = exports.onMatchAnalysisJobFinishedNotify = void 0;
exports.writeSystemActivity = writeSystemActivity;
exports.dayKey = dayKey;
exports.weekKey = weekKey;
exports.notifyAnalysisFinished = notifyAnalysisFinished;
exports.notifyEvidenceFulfilled = notifyEvidenceFulfilled;
exports.notifyWatchlistChange = notifyWatchlistChange;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firebase_functions_1 = require("firebase-functions");
const notificationPolicy_1 = require("./notificationPolicy");
const ALREADY_EXISTS = 6;
function isAlreadyExists(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === ALREADY_EXISTS ||
            error.code === 'already-exists'));
}
/**
 * Writes a server-authored activity with a deterministic id. Re-delivery of the same trigger
 * hits ALREADY_EXISTS and is ignored, so one real event can never push twice.
 */
async function writeSystemActivity(db, activityId, input) {
    try {
        await db.collection('activities').doc(activityId).create({
            ...input,
            actorId: 'system',
            actorName: 'ScoutX',
            actorRole: 'system',
            read: false,
            createdAt: new Date().toISOString(),
        });
        return true;
    }
    catch (error) {
        if (isAlreadyExists(error)) {
            return false;
        }
        throw error;
    }
}
function dayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}
function weekKey(now = new Date()) {
    const copy = new Date(now);
    const day = copy.getUTCDay();
    copy.setUTCDate(copy.getUTCDate() - day + (day === 0 ? -6 : 1));
    return copy.toISOString().slice(0, 10);
}
async function notifyAnalysisFinished(db, ownerId, jobId, outcome) {
    const completed = outcome === 'completed';
    await writeSystemActivity(db, `analysis-${outcome}-${jobId}`, {
        recipientId: ownerId,
        recipientRole: 'player',
        type: completed ? 'analysis_completed' : 'analysis_failed',
        category: 'analysis',
        title: completed ? 'Match analysis ready' : 'Match analysis could not finish',
        body: completed
            ? 'Your match analysis is ready. Open it to review the evidence.'
            : 'Your match analysis stopped before a report was produced. Open it to retry.',
        reference: { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' },
    });
}
/** Fires once per job when its status first reaches a terminal state. */
exports.onMatchAnalysisJobFinishedNotify = (0, firestore_2.onDocumentUpdated)('matchAnalysisJobs/{jobId}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status || typeof after.playerId !== 'string') {
        return;
    }
    if (after.status === 'complete') {
        await notifyAnalysisFinished((0, firestore_1.getFirestore)(), after.playerId, event.params.jobId, 'completed');
    }
    else if (after.status === 'failed') {
        await notifyAnalysisFinished((0, firestore_1.getFirestore)(), after.playerId, event.params.jobId, 'failed');
    }
});
async function notifyEvidenceFulfilled(db, scoutId, playerId, requestId) {
    await writeSystemActivity(db, `evidence-fulfilled-${requestId}`, {
        recipientId: scoutId,
        recipientRole: 'scout',
        type: 'evidence_fulfilled',
        category: 'scouting',
        title: 'Evidence request answered',
        body: 'A player responded to your evidence request. Open their profile to review it.',
        reference: { entityType: 'player', entityId: playerId, label: 'Player' },
    });
}
/** One watchlist push per scout per day at most, however many watched players change. */
async function notifyWatchlistChange(db, scoutId, playerId) {
    await writeSystemActivity(db, `watchlist-${scoutId}-${dayKey()}`, {
        recipientId: scoutId,
        recipientRole: 'scout',
        type: 'watchlist_change',
        category: 'scouting',
        title: 'Watchlist update',
        body: 'A player on your watchlist added new evidence.',
        reference: { entityType: 'player', entityId: playerId, label: 'Player' },
    });
}
exports.onPassportSummaryWrittenNotifyOwner = (0, firestore_2.onDocumentWritten)('passportSummaries/{playerId}', async (event) => {
    const after = event.data?.after.exists ? event.data.after.data() : null;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    if (!after || !(0, notificationPolicy_1.isMeaningfulPassportImprovement)(before?.coverage, after.coverage)) {
        return;
    }
    const playerId = event.params.playerId;
    await writeSystemActivity((0, firestore_1.getFirestore)(), `passport-improved-${playerId}-${dayKey()}`, {
        recipientId: playerId,
        recipientRole: 'player',
        type: 'passport_improved',
        category: 'passport',
        title: 'Football Passport improved',
        body: 'New evidence strengthened a section of your Football Passport.',
        reference: { entityType: 'player', entityId: playerId, label: 'Football Passport' },
    });
});
const TRIAL_COPY = {
    accepted: { title: 'Trial accepted', body: 'A player accepted your trial invitation.' },
    declined: { title: 'Trial declined', body: 'A player declined your trial invitation.' },
    rescheduled: { title: 'Trial rescheduled', body: 'Your trial has a new date. Open it to review.' },
    cancelled: { title: 'Trial cancelled', body: 'A trial you were invited to was cancelled.' },
    completed: { title: 'Trial completed', body: 'Your trial was marked as completed.' },
};
exports.onTrialInvitationUpdatedNotify = (0, firestore_2.onDocumentUpdated)('trialInvitations/{trialId}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) {
        return;
    }
    const party = (0, notificationPolicy_1.trialUpdateRecipient)(before.status, after.status);
    const copy = typeof after.status === 'string' ? TRIAL_COPY[after.status] : undefined;
    const recipientId = party === 'scout' ? after.scoutId : after.playerId;
    if (!party || !copy || typeof recipientId !== 'string') {
        return;
    }
    const trialId = event.params.trialId;
    const revision = Array.isArray(after.history) ? after.history.length : 0;
    await writeSystemActivity((0, firestore_1.getFirestore)(), `trial-${trialId}-${after.status}-${revision}`, {
        recipientId,
        recipientRole: party,
        type: 'trial_update',
        category: 'trial',
        title: copy.title,
        body: copy.body,
        reference: { entityType: 'trial', entityId: trialId, label: 'Trial' },
    });
});
const REMINDER_INACTIVE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Weekly nudge for players with an open development goal and no training logged for a week.
 * Players without goals are never reminded.
 */
exports.sendDevelopmentReminders = (0, scheduler_1.onSchedule)({ schedule: 'every wednesday 17:00', timeZone: 'Europe/Zurich' }, async () => {
    const db = (0, firestore_1.getFirestore)();
    const week = weekKey();
    const cutoff = new Date(Date.now() - REMINDER_INACTIVE_MS).toISOString().slice(0, 10);
    const profiles = await db.collection('profiles').limit(500).get();
    let created = 0;
    for (const profile of profiles.docs) {
        const playerRef = db.collection('players').doc(profile.id);
        const goals = await playerRef
            .collection('developmentGoals')
            .where('status', 'in', ['active', 'improving'])
            .limit(1)
            .get();
        if (goals.empty) {
            continue;
        }
        const latest = await playerRef.collection('trainingSessions').orderBy('date', 'desc').limit(1).get();
        const lastDate = latest.empty ? null : latest.docs[0].get('date');
        if (typeof lastDate === 'string' && lastDate.slice(0, 10) >= cutoff) {
            continue;
        }
        const wrote = await writeSystemActivity(db, `dev-reminder-${profile.id}-${week}`, {
            recipientId: profile.id,
            recipientRole: 'player',
            type: 'development_reminder',
            category: 'development',
            title: 'Keep your goal moving',
            body: 'No training logged this week. A short session keeps your development goal on track.',
            reference: { entityType: 'goal', entityId: goals.docs[0].id, label: 'Development goal' },
        });
        if (wrote)
            created += 1;
    }
    firebase_functions_1.logger.info('Development reminders created', { week, created });
});
//# sourceMappingURL=notificationProducers.js.map