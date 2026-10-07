import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { getUserSafetyPolicy, type SafetyPolicy } from '@/features/youth-safety/policy';
import {
  UserSafetyRepository,
  type UserSafetyRecord,
} from '@/features/youth-safety/repositories/UserSafetyRepository';

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
  const [record, setRecord] = useState<UserSafetyRecord | null | undefined>(undefined);

  useEffect(() => {
    setRecord(undefined);
    if (!uid) return undefined;
    return UserSafetyRepository.subscribe(uid, setRecord, () => setRecord(null));
  }, [uid]);

  const value = useMemo<UserSafetyContextValue>(
    () => ({
      record: uid ? record : null,
      policy: getUserSafetyPolicy(uid ? (record ?? null) : null),
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
