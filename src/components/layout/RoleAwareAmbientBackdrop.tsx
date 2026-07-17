import { AmbientBackdrop, type AmbientMood } from '@/components/layout/AmbientBackdrop';
import { useAuth } from '@/features/auth/store/AuthProvider';

function resolveAmbientMood(role: string | null | undefined): AmbientMood {
  if (role === 'scout' || role === 'coach') {
    return 'cool';
  }
  return 'warm';
}

/** Role-aware cinematic backdrop — cool for scouts, warm for players/guests. */
export function RoleAwareAmbientBackdrop() {
  const { role } = useAuth();
  return <AmbientBackdrop mood={resolveAmbientMood(role)} />;
}
