import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { PlayerProfileScreen } from '@/features/player-profile';

export type AuthenticatedScreenProps = {
  onSignOut: () => Promise<void>;
};

export function AuthenticatedScreen({ onSignOut }: AuthenticatedScreenProps) {
  const { user } = useAuth();

  return (
    <View className="flex-1">
      <PlayerProfileScreen onEditPress={() => undefined} />
      <View className="px-4 pb-4 pt-2">
        <AuthCard title="Signed In" subtitle={user?.email ?? 'ScoutX member'}>
          <Button variant="secondary" onPress={() => void onSignOut()}>
            Sign out
          </Button>
        </AuthCard>
      </View>
    </View>
  );
}
