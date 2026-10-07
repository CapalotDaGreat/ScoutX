"use strict";
// Mirrored verbatim in functions/src/safety/policy.ts; tests/unit/safetyPolicy.test.ts fails
// if the two copies differ. Edit both together.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUARDIAN_CONSENT_VERSION = exports.YOUTH_SCOPES = exports.AGE_BANDS = void 0;
exports.isAgeBand = isAgeBand;
exports.isYouthScope = isYouthScope;
exports.canChangeAgeBand = canChangeAgeBand;
exports.getUserSafetyPolicy = getUserSafetyPolicy;
exports.AGE_BANDS = ['under13', '13-17', '18plus'];
exports.YOUTH_SCOPES = [
    'public_passport',
    'discovery',
    'scout_contact',
    'public_media',
    'public_movement',
    'ai_analysis',
];
exports.GUARDIAN_CONSENT_VERSION = '2026-10-v1';
function isAgeBand(value) {
    return value === 'under13' || value === '13-17' || value === '18plus';
}
function isYouthScope(value) {
    return typeof value === 'string' && exports.YOUTH_SCOPES.includes(value);
}
/** Adults may move to a stricter band; loosening needs support. */
function canChangeAgeBand(from, to) {
    if (from === null || from === to)
        return true;
    const order = { under13: 0, '13-17': 1, '18plus': 2 };
    return order[to] < order[from];
}
function getUserSafetyPolicy(state, now = new Date()) {
    const ageBand = state?.ageBand ?? null;
    const isMinor = ageBand === '13-17';
    const expired = state?.consentExpiresAt !== null &&
        state?.consentExpiresAt !== undefined &&
        Date.parse(state.consentExpiresAt) <= now.getTime();
    const approved = isMinor && state?.guardianStatus === 'approved' && !expired;
    const has = (scope) => !isMinor || (approved && (state?.scopes ?? []).includes(scope));
    const active = ageBand === '18plus' || approved;
    return {
        ageBand,
        needsAgeBand: ageBand === null,
        blocked: ageBand === 'under13',
        isMinor,
        awaitingGuardian: isMinor && !approved,
        youthFunctionalityActive: active,
        canUsePublicPassport: active && has('public_passport'),
        canBeDiscovered: active && has('discovery'),
        canReceiveScoutContact: active && has('scout_contact'),
        canReceiveTrials: active && has('scout_contact'),
        trialsNeedGuardianApproval: isMinor,
        canPublishMedia: active && has('public_media'),
        canShowMovementPublicly: active && has('public_movement'),
        canUseAiAnalysis: active && has('ai_analysis'),
        canRecordMovement: ageBand !== 'under13',
        canSeePromotions: ageBand === '18plus',
        genericLockScreenOnly: isMinor,
        ageGroupLabel: isMinor ? 'youth' : null,
    };
}
//# sourceMappingURL=policy.js.map