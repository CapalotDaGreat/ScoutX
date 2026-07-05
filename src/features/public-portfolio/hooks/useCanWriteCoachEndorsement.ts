import { useMemo } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { canAccessFeature } from '@/features/auth/services/authAccess';

export function useCanWriteCoachEndorsement(playerId: string): boolean {
  const { user, role } = useAuth();

  return useMemo(() => {
    if (!user?.id || user.id === playerId) {
      return false;
    }
    return canAccessFeature(role ?? undefined, 'scout.endorse') || role === 'coach';
  }, [playerId, role, user?.id]);
}
