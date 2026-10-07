"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PUSHES_PER_HOUR = exports.ACTIVITY_CATEGORY = exports.NOTIFICATION_CATEGORIES = void 0;
exports.pushPathFor = pushPathFor;
exports.solidCoverageCount = solidCoverageCount;
exports.isMeaningfulPassportImprovement = isMeaningfulPassportImprovement;
exports.trialUpdateRecipient = trialUpdateRecipient;
exports.defaultStoredPreferences = defaultStoredPreferences;
exports.parseStoredPreferences = parseStoredPreferences;
exports.decidePush = decidePush;
/**
 * Server-side push policy. Kept dependency-free so the unit suite can import it directly.
 * The category list must stay in sync with the client `NOTIFICATION_CATEGORIES`.
 */
exports.NOTIFICATION_CATEGORIES = [
    'match',
    'analysis',
    'development',
    'scouting',
    'trial',
    'career',
    'passport',
    'system',
];
/** Activity types that can produce a push, and the user-facing category each belongs to. */
exports.ACTIVITY_CATEGORY = {
    portfolio_viewed: 'passport',
    recommendation_received: 'passport',
    trial_invitation: 'trial',
    milestone_earned: 'career',
    weekly_report_ready: 'development',
    analysis_completed: 'analysis',
    analysis_failed: 'analysis',
    evidence_requested: 'scouting',
    evidence_fulfilled: 'scouting',
    watchlist_change: 'scouting',
    trial_update: 'trial',
    passport_improved: 'passport',
    development_reminder: 'development',
};
/** Deep-link path (no scheme) opened when a push is tapped. Unknown types open Home. */
function pushPathFor(type, reference, recipientRole) {
    const id = typeof reference?.entityId === 'string' ? reference.entityId : '';
    const scout = recipientRole === 'scout' || recipientRole === 'coach';
    switch (type) {
        case 'analysis_completed':
        case 'analysis_failed':
            return id ? `match/${id}` : 'player/home';
        case 'trial_invitation':
        case 'trial_update':
            return id ? `trial/${id}` : scout ? 'scout/trials' : 'player/trials';
        case 'evidence_requested':
            return id ? `request/${id}` : 'player/requests';
        case 'evidence_fulfilled':
            return id ? `scout/player/${id}` : 'scout';
        case 'watchlist_change':
            return 'scout';
        case 'weekly_report_ready':
        case 'development_reminder':
            return 'player/performance';
        default:
            return scout ? 'scout' : 'player/home';
    }
}
/** Number of evidence-coverage dimensions at moderate or strong. */
function solidCoverageCount(coverage) {
    if (!Array.isArray(coverage))
        return 0;
    return coverage.filter((item) => {
        const row = item && typeof item === 'object' ? item : null;
        return row?.state === 'moderate' || row?.state === 'strong';
    }).length;
}
/** A Passport change is only worth a push when a coverage dimension became solid. */
function isMeaningfulPassportImprovement(before, after) {
    return solidCoverageCount(after) > solidCoverageCount(before);
}
/** Who should hear about a trial status change: the side that did not make it. */
function trialUpdateRecipient(fromStatus, toStatus) {
    if (fromStatus === toStatus || typeof toStatus !== 'string')
        return null;
    if (toStatus === 'accepted' || toStatus === 'declined')
        return 'scout';
    if (toStatus === 'rescheduled' || toStatus === 'cancelled' || toStatus === 'completed') {
        return 'player';
    }
    return null;
}
/** Pre-Phase-AE category keys, mapped to their replacements. */
const LEGACY_CATEGORY_KEYS = {
    trials: 'trial',
    watchlist: 'scouting',
    recommendations: 'passport',
};
/** Hard cap across all categories, independent of per-type cooldowns. */
exports.MAX_PUSHES_PER_HOUR = 6;
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function defaultStoredPreferences() {
    const categories = {};
    for (const key of exports.NOTIFICATION_CATEGORIES)
        categories[key] = true;
    return { pushEnabled: true, categories };
}
function parseStoredPreferences(value) {
    const result = defaultStoredPreferences();
    const record = asRecord(value);
    if (!record)
        return result;
    result.pushEnabled = record.pushEnabled !== false;
    const categories = asRecord(record.categories) ?? {};
    for (const [key, enabled] of Object.entries(categories)) {
        if (typeof enabled !== 'boolean')
            continue;
        const mapped = exports.NOTIFICATION_CATEGORIES.includes(key)
            ? key
            : LEGACY_CATEGORY_KEYS[key];
        if (mapped)
            result.categories[mapped] = enabled;
    }
    return result;
}
function decidePush(activityType, preferences, recentSendTimes, now) {
    const category = exports.ACTIVITY_CATEGORY[activityType];
    if (!category)
        return { send: false, reason: 'unknown_type' };
    if (!preferences.pushEnabled)
        return { send: false, reason: 'push_disabled' };
    if (!preferences.categories[category])
        return { send: false, reason: 'category_disabled' };
    const lastHour = recentSendTimes.filter((time) => now - time < 60 * 60 * 1000);
    if (lastHour.length >= exports.MAX_PUSHES_PER_HOUR)
        return { send: false, reason: 'hourly_cap' };
    return { send: true, category };
}
//# sourceMappingURL=notificationPolicy.js.map