import { useEffect, useMemo, useState } from 'react';
import { initializeAuthListener } from '@/features/auth/services/authService';
import { type AuthUser } from '@/features/auth/types';

export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = initializeAuthListener((nextUser) => {
      setUser(nextUser);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  return useMemo(() => ({ user, isLoading }), [isLoading, user]);
}
