import { useEffect, useMemo, useRef, useState } from 'react';
import { initializeAuthListener } from '@/features/auth/services/authService';
import { type AuthUser } from '@/features/auth/types';

const AUTH_LISTENER_TIMEOUT_MS = 4_000;

/**
 * Subscribes to Firebase/mock auth. Always clears loading within a timeout so a
 * hung Auth listener cannot freeze the app on "Preparing your PitchProof session".
 */
export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasSettledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const markReady = (nextUser: AuthUser | null) => {
      if (cancelled) {
        return;
      }

      hasSettledRef.current = true;
      setUser(nextUser);
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
      unsubscribe = initializeAuthListener((nextUser) => {
        if (cancelled) {
          return;
        }

        clearTimeout(timeoutId);
        hasSettledRef.current = true;
        setUser(nextUser);
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
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  return useMemo(() => ({ user, isLoading }), [isLoading, user]);
}
