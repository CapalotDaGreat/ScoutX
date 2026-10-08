import { doc, onSnapshot } from 'firebase/firestore';
import { useMockData } from '@/config/appMode';
import { getFirestoreDb } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';
import {
  isAgeBand,
  type AgeBand,
  type GuardianStatus,
  type SafetyState,
} from '@/features/youth-safety/policy';

const GUARDIAN_STATUSES: readonly GuardianStatus[] = [
  'not_required',
  'required',
  'pending',
  'confirming',
  'approved',
  'declined',
  'revoked',
  'expired',
];

export type UserSafetyRecord = SafetyState & {
  guardianEmailMasked: string | null;
  /** Under 13: when the account is deleted unless a parent has consented by then. */
  childDeleteAfter: string | null;
};

export function parseUserSafety(data: Record<string, unknown> | undefined): UserSafetyRecord | null {
  if (!data || !isAgeBand(data.ageBand)) return null;
  return {
    ageBand: data.ageBand,
    guardianStatus: GUARDIAN_STATUSES.includes(data.guardianStatus as GuardianStatus)
      ? (data.guardianStatus as GuardianStatus)
      : 'required',
    scopes: Array.isArray(data.scopes) ? data.scopes.filter((item): item is string => typeof item === 'string') : [],
    consentExpiresAt: typeof data.consentExpiresAt === 'string' ? data.consentExpiresAt : null,
    guardianEmailMasked: typeof data.guardianEmailMasked === 'string' ? data.guardianEmailMasked : null,
    childDeleteAfter: typeof data.childDeleteAfter === 'string' ? data.childDeleteAfter : null,
  };
}

function callable<T>(name: string) {
  const fn = createCallableFunction<T>(name);
  if (!fn) throw new Error('PitchProof needs a connection to the server for this step.');
  return fn;
}

export const UserSafetyRepository = {
  /** Emits null until an age band is recorded; `undefined` means "not loaded yet". */
  subscribe(
    uid: string,
    onData: (record: UserSafetyRecord | null) => void,
    onError: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      // Offline demo builds only (never production): no server to record an age band.
      onData(
        useMockData()
          ? { ageBand: '18plus', guardianStatus: 'not_required', scopes: [], consentExpiresAt: null, guardianEmailMasked: null, childDeleteAfter: null }
          : null,
      );
      return () => undefined;
    }
    return onSnapshot(
      doc(db, 'userSafety', uid),
      (snapshot) => onData(parseUserSafety(snapshot.data())),
      onError,
    );
  },

  async setAgeBand(ageBand: AgeBand): Promise<void> {
    await callable<{ ageBand: AgeBand }>('setAgeBand')({ ageBand });
  },

  async requestGuardianConsent(guardianEmail: string, playerFirstName: string): Promise<void> {
    await callable<{ guardianEmail: string; playerFirstName: string }>('requestGuardianConsent')({
      guardianEmail,
      playerFirstName,
    });
  },

  async revokeGuardianConsent(): Promise<void> {
    await callable<Record<string, never>>('revokeGuardianConsent')({});
  },
};
