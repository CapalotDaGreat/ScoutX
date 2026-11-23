import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { getUserSafetyPolicy, type SafetyPolicy } from '@/features/youth-safety/policy';
import {
  UserSafetyRepository,
  type UserSafetyRecord,
} from '@/features/youth-safety/repositories/UserSafetyRepository';
import { recordForAccount, safetyLoadFailed, type LoadedSafetyRecord } from '@/features/youth-safety/context/recordForAccount';

type UserSafetyContextValue = {
  /** undefined while loading or unreadable; null when no age band has been recorded yet. */
  record: UserSafetyRecord | null | undefined;
  policy: SafetyPolicy;
  /** True for signed-in, non-guest accounts that must pass the age and guardian gate. */
  gated: boolean;
  /** The safety record could not be read. This is not the same as a missing age band. */
  unavailable: boolean;
  retrySafety: () => void;
};

const UserSafetyContext = createContext<UserSafetyContextValue | null>(null);

export function UserSafetyProvider({ children }: { children: ReactNode }) {
  const { status, user, isGuest } = useAuth();
  const uid = status === 'authenticated' && !isGuest ? (user?.uid ?? null) : null;
  const [loaded, setLoaded] = useState<LoadedSafetyRecord | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retrySafety = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!uid) return undefined;
    const unsubscribe = UserSafetyRepository.subscribe(
      uid,
      (record) => setLoaded({ uid, record }),
      (error) => {
        const code = 'code' in error && typeof error.code === 'string' ? error.code.toLowerCase() : '';
        const offline = code === 'unavailable' || code.endsWith('/unavailable') || /offline|unavailable|network/i.test(error.message);
        setLoaded((current) => {
          // A record already shown for this account stays. An offline failure is not "no age band".
          if (offline && current?.uid === uid && current.unavailable !== true) return current;
          return offline ? { uid, record: null, unavailable: true } : { uid, record: null };
        });
      },
    );
    return () => {
      unsubscribe();
      // Signing back in to the same account waits for a fresh record, as before.
      setLoaded(null);
    };
  }, [attempt, uid]);

  const record = recordForAccount(uid, loaded);
  const unavailable = safetyLoadFailed(uid, loaded);
  const value = useMemo<UserSafetyContextValue>(
    () => ({
      record,
      policy: getUserSafetyPolicy(unavailable ? null : (record ?? null)),
      gated: uid !== null,
      unavailable,
      retrySafety,
    }),
    [record, retrySafety, uid, unavailable],
  );

  return <UserSafetyContext.Provider value={value}>{children}</UserSafetyContext.Provider>;
}

export function useUserSafety(): UserSafetyContextValue {
  const context = useContext(UserSafetyContext);
  if (!context) {
    throw new Error('useUserSafety must be used within UserSafetyProvider');
  }
  return context;
}
