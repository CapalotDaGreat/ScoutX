"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PUSHES_PER_HOUR = exports.ACTIVITY_CATEGORY = exports.NOTIFICATION_CATEGORIES = void 0;
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
    evidence_requested: 'scouting',
    watchlist_change: 'scouting',
};
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