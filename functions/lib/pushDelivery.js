"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onActivityCreatedPush = void 0;
exports.deliverActivityPush = deliverActivityPush;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const notificationPolicy_1 = require("./notificationPolicy");
const DEFAULT_EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/**
 * Push copy is fixed server-side: activity title/body are client-written and must not be
 * relayed to another user's lock screen (phishing / harassment vector).
 */
const PUSH_COPY = {
    portfolio_viewed: {
        title: 'Football Passport viewed',
        body: 'Someone viewed your Football Passport. Open PitchProof to see details.',
    },
    recommendation_received: {
        title: 'New recommendation',
        body: 'You received a new recommendation on your Football Passport.',
    },
    trial_invitation: {
        title: 'Trial invitation',
        body: 'You have a new trial invitation. Open PitchProof to respond.',
    },
};
/** Self-addressed system activities may use their own copy (the author is the recipient). */
function resolvePushCopy(activity) {
    const type = activity.type ?? '';
    if (PUSH_COPY[type]) {
        return PUSH_COPY[type];
    }
    if (activity.actorId === 'system' && activity.title && activity.body) {
        return { title: activity.title.slice(0, 120), body: activity.body.slice(0, 300) };
    }
    return null;
}
async function isGenuineTrialInvitation(activity) {
    const trialId = activity.reference?.entityId;
    if (!trialId || typeof trialId !== 'string') {
        return false;
    }
    const trial = await (0, firestore_1.getFirestore)().collection('trialInvitations').doc(trialId).get();
    const data = trial.data();
    return activity.actorId === 'system' && data?.playerId === activity.recipientId;
}
const HOUR_MS = 60 * 60 * 1000;
/** Minimum gap between pushes of the same type to one recipient, to prevent notification spam. */
const PUSH_COOLDOWN_MS = {
    portfolio_viewed: 6 * HOUR_MS,
    recommendation_received: 0.25 * HOUR_MS,
    milestone_earned: 1 * HOUR_MS,
    weekly_report_ready: 24 * HOUR_MS,
    trial_invitation: 2 * 60 * 1000,
    watchlist_change: 6 * HOUR_MS,
    passport_improved: 24 * HOUR_MS,
    development_reminder: 72 * HOUR_MS,
};
const PUSH_THROTTLE_COLLECTION = 'pushThrottle';
/**
 * Atomically applies the recipient's stored preferences, the per-type cooldown and the hourly
 * cap, then claims a push slot. Returns the reason when the push must not be sent.
 */
async function claimPushSlot(recipientId, type) {
    const db = (0, firestore_1.getFirestore)();
    const throttleRef = db.collection(PUSH_THROTTLE_COLLECTION).doc(recipientId);
    const preferencesRef = db.collection('notificationPreferences').doc(recipientId);
    let preview = 'details';
    const decision = await db.runTransaction(async (transaction) => {
        const [throttle, preferencesSnapshot] = await Promise.all([
            transaction.get(throttleRef),
            transaction.get(preferencesRef),
        ]);
        const now = Date.now();
        const data = throttle.data() ?? {};
        const recent = Array.isArray(data.recent)
            ? data.recent.filter((value) => typeof value === 'number')
            : [];
        const preferences = (0, notificationPolicy_1.parseStoredPreferences)(preferencesSnapshot.data());
        preview = preferences.lockScreenPreview;
        const decision = (0, notificationPolicy_1.decidePush)(type, preferences, recent, now);
        if (!decision.send) {
            return decision;
        }
        const cooldown = PUSH_COOLDOWN_MS[type] ?? 0;
        const lastSent = typeof data[type] === 'number' ? data[type] : 0;
        if (cooldown > 0 && now - lastSent < cooldown) {
            return { send: false, reason: 'cooldown' };
        }
        const keep = recent.filter((time) => now - time < HOUR_MS).slice(-notificationPolicy_1.MAX_PUSHES_PER_HOUR);
        transaction.set(throttleRef, { [type]: now, recent: [...keep, now] }, { merge: true });
        return decision;
    });
    return { decision, preview };
}
async function sendExpoPush(token, title, body, data) {
    const response = await fetch(process.env.EXPO_PUSH_URL || DEFAULT_EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            to: token,
            sound: 'default',
            title,
            body,
            priority: 'high',
            data,
        }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Expo push failed (${response.status}): ${text}`);
    }
}
/** Full delivery chain for one activity document: policy, copy, throttle, token, send. */
async function deliverActivityPush(activityId, activity) {
    if (!activity?.recipientId || !activity.title || !activity.body) {
        return { sent: false, reason: 'incomplete' };
    }
    if (!activity.type || !(activity.type in notificationPolicy_1.ACTIVITY_CATEGORY)) {
        return { sent: false, reason: 'not_pushable' };
    }
    if (activity.type === 'portfolio_viewed' && activity.actorId === activity.recipientId) {
        return { sent: false, reason: 'self' };
    }
    const copy = resolvePushCopy(activity);
    if (!copy) {
        return { sent: false, reason: 'no_copy' };
    }
    if (activity.type === 'trial_invitation' && !(await isGenuineTrialInvitation(activity))) {
        firebase_functions_1.logger.warn('Skipping push for unverified trial invitation activity', {
            recipientId: activity.recipientId,
        });
        return { sent: false, reason: 'unverified_trial' };
    }
    const { decision, preview } = await claimPushSlot(activity.recipientId, activity.type);
    if (!decision.send) {
        firebase_functions_1.logger.info('Push suppressed', {
            recipientId: activity.recipientId,
            type: activity.type,
            reason: decision.reason,
        });
        return { sent: false, reason: decision.reason };
    }
    const tokenSnapshot = await (0, firestore_1.getFirestore)().collection('pushTokens').doc(activity.recipientId).get();
    const tokenData = tokenSnapshot.data();
    if (!tokenData?.token) {
        firebase_functions_1.logger.info('No push token for recipient', { recipientId: activity.recipientId });
        return { sent: false, reason: 'no_token' };
    }
    const path = (0, notificationPolicy_1.pushPathFor)(activity.type, activity.reference, activity.recipientRole);
    try {
        const safety = await (0, firestore_1.getFirestore)().collection('userSafety').doc(activity.recipientId).get();
        const shown = (0, notificationPolicy_1.lockScreenCopy)(copy, preview, safety.get('ageBand') !== '18plus');
        await sendExpoPush(tokenData.token, shown.title, shown.body, {
            path,
            activityId,
            type: activity.type,
        });
        firebase_functions_1.logger.info('Push notification sent', { recipientId: activity.recipientId, type: activity.type });
        return { sent: true, path };
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to send push notification', { recipientId: activity.recipientId, error });
        return { sent: false, reason: 'send_failed' };
    }
}
exports.onActivityCreatedPush = (0, firestore_2.onDocumentCreated)('activities/{activityId}', async (event) => {
    await deliverActivityPush(event.params.activityId, event.data?.data());
});
//# sourceMappingURL=pushDelivery.js.map