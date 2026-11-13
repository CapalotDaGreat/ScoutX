import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { getUserSafetyPolicy, type SafetyPolicy } from '@/features/youth-safety/policy';
import {
  UserSafetyRepository,
  type UserSafetyRecord,
} from '@/features/youth-safety/repositories/UserSafetyRepository';
import { recordForAccount, type LoadedSafetyRecord } from '@/features/youth-safety/context/recordForAccount';

type UserSafetyContextValue = {
  /** undefined while loading; null when no age band has been recorded yet. */
  record: UserSafetyRecord | null | undefined;
  policy: SafetyPolicy;
  /** True for signed-in, non-guest accounts that must pass the age and guardian gate. */
  gated: boolean;
};

const UserSafetyContext = createContext<UserSafetyContextValue | null>(null);

export function UserSafetyProvider({ children }: { children: ReactNode }) {
  const { status, user, isGuest } = useAuth();
  const uid = status === 'authenticated' && !isGuest ? (user?.uid ?? null) : null;
  const [loaded, setLoaded] = useState<LoadedSafetyRecord | null>(null);

  useEffect(() => {
    if (!uid) return undefined;
    const unsubscribe = UserSafetyRepository.subscribe(
      uid,
      (record) => setLoaded({ uid, record }),
      () => setLoaded({ uid, record: null }),
    );
    return () => {
      unsubscribe();
      // Signing back in to the same account waits for a fresh record, as before.
      setLoaded(null);
    };
  }, [uid]);

  const record = recordForAccount(uid, loaded);
  const value = useMemo<UserSafetyContextValue>(
    () => ({
      record,
      policy: getUserSafetyPolicy(record ?? null),
      gated: uid !== null,
    }),
    [record, uid],
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
