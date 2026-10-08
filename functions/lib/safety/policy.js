"use strict";
// Mirrored verbatim in functions/src/safety/policy.ts; tests/unit/safetyPolicy.test.ts fails
// if the two copies differ. Edit both together.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHILD_CONSENT_VERSION = exports.GUARDIAN_CONSENT_VERSION = exports.CHILD_SCOPES = exports.YOUTH_SCOPES = exports.AGE_BANDS = void 0;
exports.isAgeBand = isAgeBand;
exports.isYouthScope = isYouthScope;
exports.grantableScopes = grantableScopes;
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
/**
 * Under-13 accounts are private: a parent can only allow AI analysis. Profiles, discovery,
 * scout contact, public media and public movement stay off whatever is stored in `scopes`.
 */
exports.CHILD_SCOPES = ['ai_analysis'];
exports.GUARDIAN_CONSENT_VERSION = '2026-10-v1';
exports.CHILD_CONSENT_VERSION = '2026-10-child-v1';
function isAgeBand(value) {
    return value === 'under13' || value === '13-17' || value === '18plus';
}
function isYouthScope(value) {
    return typeof value === 'string' && exports.YOUTH_SCOPES.includes(value);
}
/** The scopes a guardian may grant for this age band. */
function grantableScopes(ageBand) {
    return ageBand === 'under13' ? exports.CHILD_SCOPES : exports.YOUTH_SCOPES;
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
    const privateOnly = ageBand === 'under13';
    const isMinor = privateOnly || ageBand === '13-17';
    const expired = state?.consentExpiresAt !== null &&
        state?.consentExpiresAt !== undefined &&
        Date.parse(state.consentExpiresAt) <= now.getTime();
    const approved = isMinor && state?.guardianStatus === 'approved' && !expired;
    const allowed = grantableScopes(ageBand);
    const has = (scope) => !isMinor || (approved && allowed.includes(scope) && (state?.scopes ?? []).includes(scope));
    const active = ageBand === '18plus' || approved;
    return {
        ageBand,
        needsAgeBand: ageBand === null,
        isMinor,
        privateOnly,
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
        canRecordMovement: true,
        canChooseNonPlayerRole: !privateOnly,
        canSeePromotions: ageBand === '18plus',
        genericLockScreenOnly: isMinor,
        ageGroupLabel: isMinor ? 'youth' : null,
    };
}
//# sourceMappingURL=policy.js.map