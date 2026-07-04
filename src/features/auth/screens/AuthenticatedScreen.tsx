import { useAuth } from '@/features/auth/store/AuthProvider';
import { PlayerAuthenticatedScreen } from '@/features/auth/screens/PlayerAuthenticatedScreen';
import { ScoutAuthenticatedScreen } from '@/features/auth/screens/ScoutAuthenticatedScreen';

export type AuthenticatedScreenProps = {
  onSignOut: () => Promise<void>;
};

export function AuthenticatedScreen({ onSignOut }: AuthenticatedScreenProps) {
  const { role } = useAuth();

  if (role === 'scout') {
    return <ScoutAuthenticatedScreen onSignOut={onSignOut} />;
  }

  return <PlayerAuthenticatedScreen onSignOut={onSignOut} />;
}
