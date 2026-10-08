// Mirrored verbatim in functions/src/safety/policy.ts; tests/unit/safetyPolicy.test.ts fails
// if the two copies differ. Edit both together.

export type AgeBand = 'under13' | '13-17' | '18plus';

export const AGE_BANDS: readonly AgeBand[] = ['under13', '13-17', '18plus'];

export type GuardianStatus =
  | 'not_required'
  | 'required'
  | 'pending'
  /** Under-13: the parent signed the consent form and still has to confirm it from a second email. */
  | 'confirming'
  | 'approved'
  | 'declined'
  | 'revoked'
  | 'expired';

/** Things a guardian can allow separately. Nothing is granted by default. */
export type YouthScope =
  | 'public_passport'
  | 'discovery'
  | 'scout_contact'
  | 'public_media'
  | 'public_movement'
  | 'ai_analysis';

export const YOUTH_SCOPES: readonly YouthScope[] = [
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
export const CHILD_SCOPES: readonly YouthScope[] = ['ai_analysis'];

export const GUARDIAN_CONSENT_VERSION = '2026-10-v1';
export const CHILD_CONSENT_VERSION = '2026-10-child-v1';

export type SafetyState = {
  ageBand: AgeBand | null;
  guardianStatus: GuardianStatus;
  scopes: readonly string[];
  consentExpiresAt: string | null;
};

export type SafetyPolicy = {
  ageBand: AgeBand | null;
  needsAgeBand: boolean;
  /** Under 13 (or 13-17): every youth protection applies. */
  isMinor: boolean;
  /** Under 13: private mode. Nobody else can see, find or contact the account. */
  privateOnly: boolean;
  awaitingGuardian: boolean;
  youthFunctionalityActive: boolean;
  canUsePublicPassport: boolean;
  canBeDiscovered: boolean;
  canReceiveScoutContact: boolean;
  canReceiveTrials: boolean;
  trialsNeedGuardianApproval: boolean;
  canPublishMedia: boolean;
  canShowMovementPublicly: boolean;
  canUseAiAnalysis: boolean;
  /** Movement sessions store no location, so every account may record them. */
  canRecordMovement: boolean;
  /** Scout, coach and club roles are for adults and teens; children can only be players. */
  canChooseNonPlayerRole: boolean;
  canSeePromotions: boolean;
  genericLockScreenOnly: boolean;
  /** Public label replacing any age detail for minors. */
  ageGroupLabel: 'youth' | null;
};

export function isAgeBand(value: unknown): value is AgeBand {
  return value === 'under13' || value === '13-17' || value === '18plus';
}

export function isYouthScope(value: unknown): value is YouthScope {
  return typeof value === 'string' && (YOUTH_SCOPES as readonly string[]).includes(value);
}

/** The scopes a guardian may grant for this age band. */
export function grantableScopes(ageBand: AgeBand | null): readonly YouthScope[] {
  return ageBand === 'under13' ? CHILD_SCOPES : YOUTH_SCOPES;
}

/** Adults may move to a stricter band; loosening needs support. */
export function canChangeAgeBand(from: AgeBand | null, to: AgeBand): boolean {
  if (from === null || from === to) return true;
  const order: Record<AgeBand, number> = { under13: 0, '13-17': 1, '18plus': 2 };
  return order[to] < order[from];
}

export function getUserSafetyPolicy(state: SafetyState | null, now: Date = new Date()): SafetyPolicy {
  const ageBand = state?.ageBand ?? null;
  const privateOnly = ageBand === 'under13';
  const isMinor = privateOnly || ageBand === '13-17';
  const expired =
    state?.consentExpiresAt !== null &&
    state?.consentExpiresAt !== undefined &&
    Date.parse(state.consentExpiresAt) <= now.getTime();
  const approved = isMinor && state?.guardianStatus === 'approved' && !expired;
  const allowed = grantableScopes(ageBand);
  const has = (scope: YouthScope) =>
    !isMinor || (approved && allowed.includes(scope) && (state?.scopes ?? []).includes(scope));
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
