"use strict";
// Pure moderation rules shared by triggers, callables and unit tests.
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECENT_AUTH_SECONDS = exports.REVIEW_SLA_HOURS = exports.MODERATION_ACTIONS = exports.REPORT_REASONS = exports.REPORT_TARGET_TYPES = void 0;
exports.isReportTargetType = isReportTargetType;
exports.isReportReason = isReportReason;
exports.isModerationAction = isModerationAction;
exports.priorityFor = priorityFor;
exports.higherPriority = higherPriority;
exports.comparePriority = comparePriority;
exports.shouldAutoRestrict = shouldAutoRestrict;
exports.actionAllowedForTarget = actionAllowedForTarget;
exports.roleMayApply = roleMayApply;
exports.isDestructive = isDestructive;
exports.isRecentAuth = isRecentAuth;
exports.holdStateFor = holdStateFor;
exports.caseStateAfter = caseStateAfter;
exports.isAppealable = isAppealable;
exports.canAppeal = canAppeal;
exports.holdKey = holdKey;
exports.validReason = validReason;
exports.REPORT_TARGET_TYPES = [
    'user',
    'post',
    'media',
    'reel',
    'passport',
    'scout',
    'evidenceRequest',
    'trial',
    'scoutingReport',
    'external_football_source',
];
exports.REPORT_REASONS = [
    'spam',
    'harassment',
    'inappropriate',
    'impersonation',
    'inappropriate_contact',
    'copyright',
    'privacy',
    'appears_in_video',
    'minor_in_video',
    'exploitation',
    'safety_concern',
    'other',
];
exports.MODERATION_ACTIONS = [
    'dismiss',
    'restrict',
    'hide',
    'remove',
    'warn',
    'suspend',
    'disable',
    'escalate',
];
function isReportTargetType(value) {
    return typeof value === 'string' && exports.REPORT_TARGET_TYPES.includes(value);
}
function isReportReason(value) {
    return typeof value === 'string' && exports.REPORT_REASONS.includes(value);
}
function isModerationAction(value) {
    return typeof value === 'string' && exports.MODERATION_ACTIONS.includes(value);
}
const URGENT_REASONS = ['minor_in_video', 'inappropriate_contact', 'exploitation', 'safety_concern'];
const HIGH_REASONS = ['appears_in_video', 'privacy', 'harassment', 'copyright', 'impersonation'];
/** Reports involving minors, contact or exploitation are reviewed first. */
function priorityFor(reason, targetOwnerIsMinor) {
    if (URGENT_REASONS.includes(reason))
        return 'urgent';
    if (HIGH_REASONS.includes(reason) || targetOwnerIsMinor)
        return 'high';
    return 'normal';
}
const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2 };
function higherPriority(a, b) {
    return PRIORITY_ORDER[a] <= PRIORITY_ORDER[b] ? a : b;
}
function comparePriority(a, b) {
    return PRIORITY_ORDER[a] - PRIORITY_ORDER[b];
}
/** Hours until a first review is due, by priority. */
exports.REVIEW_SLA_HOURS = { urgent: 4, high: 24, normal: 72 };
/**
 * People in a video (or their guardians) get it hidden from public view while it is reviewed.
 * A reported external link stops being shown until a moderator decides.
 */
function shouldAutoRestrict(targetType, reason) {
    if (targetType === 'external_football_source')
        return true;
    return ((targetType === 'media' || targetType === 'reel') &&
        (reason === 'minor_in_video' || reason === 'appears_in_video' || reason === 'privacy'));
}
const ACCOUNT_TARGETS = ['user', 'scout', 'passport'];
const ACCOUNT_ACTIONS = ['suspend', 'disable'];
function actionAllowedForTarget(action, targetType) {
    if (ACCOUNT_ACTIONS.includes(action))
        return ACCOUNT_TARGETS.includes(targetType);
    return true;
}
const MODERATOR_ACTIONS = ['dismiss', 'restrict', 'hide', 'warn', 'escalate'];
function roleMayApply(role, action) {
    return role === 'admin' || MODERATOR_ACTIONS.includes(action);
}
/** Destructive actions additionally require a sign-in within the last few minutes. */
function isDestructive(action) {
    return action === 'remove' || action === 'suspend' || action === 'disable';
}
exports.RECENT_AUTH_SECONDS = 15 * 60;
function isRecentAuth(authTimeSeconds, nowMs = Date.now()) {
    return typeof authTimeSeconds === 'number' && nowMs / 1000 - authTimeSeconds <= exports.RECENT_AUTH_SECONDS;
}
function holdStateFor(action) {
    if (action === 'restrict')
        return 'restricted';
    if (action === 'hide')
        return 'hidden';
    if (action === 'remove')
        return 'removed';
    return null;
}
function caseStateAfter(action) {
    if (action === 'dismiss')
        return 'closed';
    if (action === 'escalate')
        return 'review';
    return 'notified';
}
/** Only decisions that took something away from the user can be appealed, once. */
function isAppealable(action) {
    return action !== 'dismiss' && action !== 'escalate';
}
function canAppeal(caseState, decision, alreadyAppealed) {
    return caseState === 'notified' && decision !== null && isAppealable(decision) && !alreadyAppealed;
}
function holdKey(targetType, targetId) {
    return `${targetType}_${targetId}`;
}
function validReason(value) {
    return typeof value === 'string' && value.trim().length >= 5 && value.length <= 1000;
}
//# sourceMappingURL=model.js.map