import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentAuthUserSnapshot, initializeAuthListener, rereadCurrentProfile } from '@/features/auth/services/authService';
import { createProfileRetry } from '@/features/auth/services/profileRetry';
import { type AuthUser } from '@/features/auth/types';

const AUTH_LISTENER_TIMEOUT_MS = 4_000;

/**
 * Subscribes to Firebase/mock auth. Always clears loading within a timeout so a
 * hung Auth listener cannot freeze the app on "Preparing your PitchProof session".
 */
export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileOffline, setProfileOffline] = useState(false);
  const hasSettledRef = useRef(false);
  const profileRetry = useMemo(() => createProfileRetry(
    () => getCurrentAuthUserSnapshot()?.uid ?? null,
    (next) => {
      hasSettledRef.current = true;
      setUser(next.user);
      setProfileOffline(next.profileOffline);
      setIsLoading(false);
    },
  ), []);

  useEffect(() => {
    let cancelled = false;

    const markReady = (nextUser: AuthUser | null, offline = false) => {
      if (cancelled) {
        return;
      }

      hasSettledRef.current = true;
      profileRetry.invalidate();
      setUser(nextUser);
      setProfileOffline(Boolean(offline && nextUser));
      setIsLoading(false);
    };

    const timeoutId = setTimeout(() => {
      if (hasSettledRef.current || cancelled) {
        return;
      }

      if (__DEV__) {
        console.warn(
          '[auth] Auth listener did not respond in time — continuing without a restored session.',
        );
      }
      markReady(null);
    }, AUTH_LISTENER_TIMEOUT_MS);

    let unsubscribe: () => void = () => undefined;

    try {
      unsubscribe = initializeAuthListener((nextUser, meta) => {
        if (cancelled) {
          return;
        }

        clearTimeout(timeoutId);
        profileRetry.invalidate();
        hasSettledRef.current = true;
        setUser(nextUser);
        setProfileOffline(Boolean(meta?.profileOffline && nextUser));
        setIsLoading(false);
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (__DEV__) {
        console.warn('[auth] Failed to initialize auth listener.', error);
      }
      markReady(null);
    }

    return () => {
      cancelled = true;
      profileRetry.invalidate();
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [profileRetry]);

  const retryProfile = useCallback(async () => {
    await profileRetry.retry(rereadCurrentProfile);
  }, [profileRetry]);

  return useMemo(
    () => ({ user, isLoading, profileOffline, retryProfile }),
    [isLoading, profileOffline, retryProfile, user],
  );
}
