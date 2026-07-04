import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { PlayerProfileScreen, EditProfileModal, usePlayerProfile } from '@/features/player-profile';
import { LogMatchModal, StatisticsScreen } from '@/features/player-statistics';
import { GpsTrackingScreen } from '@/features/gps';

export type PlayerAuthenticatedScreenProps = {
  onSignOut: () => Promise<void>;
};

type PlayerView = 'profile' | 'statistics' | 'gps';

export function PlayerAuthenticatedScreen({ onSignOut }: PlayerAuthenticatedScreenProps) {
  const { user } = useAuth();
  const {
    profile,
    isLoading,
    isSaving,
    error,
    saveProfile,
    saveMatch,
    uploadImage,
    refreshProfile,
  } = usePlayerProfile();
  const [activeView, setActiveView] = useState<PlayerView>('profile');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isLogMatchModalVisible, setIsLogMatchModalVisible] = useState(false);

  return (
    <View className="flex-1">
      <View className="flex-row gap-2 px-4 pt-4">
        <Button
          variant={activeView === 'profile' ? 'primary' : 'secondary'}
          className="flex-1"
          onPress={() => setActiveView('profile')}
        >
          Profile
        </Button>
        <Button
          variant={activeView === 'statistics' ? 'primary' : 'secondary'}
          className="flex-1"
          onPress={() => setActiveView('statistics')}
        >
          Stats
        </Button>
        <Button
          variant={activeView === 'gps' ? 'primary' : 'secondary'}
          className="flex-1"
          onPress={() => setActiveView('gps')}
        >
          GPS
        </Button>
      </View>

      {activeView === 'profile' ? (
        <PlayerProfileScreen
          profile={profile}
          loading={isLoading}
          error={error}
          onRetry={refreshProfile}
          onEditPress={() => setIsEditModalVisible(true)}
          onLogMatchPress={() => setIsLogMatchModalVisible(true)}
        />
      ) : null}

      {activeView === 'statistics' ? (
        <StatisticsScreen
          matches={profile?.statisticsMatches}
          onLogMatchPress={() => setIsLogMatchModalVisible(true)}
          onRefresh={refreshProfile}
          refreshing={isLoading}
        />
      ) : null}

      {activeView === 'gps' ? <GpsTrackingScreen playerId={user?.id ?? null} /> : null}

      {profile ? (
        <EditProfileModal
          visible={isEditModalVisible}
          profile={profile}
          onClose={() => setIsEditModalVisible(false)}
          onSave={saveProfile}
          onUploadImage={uploadImage}
        />
      ) : null}

      <LogMatchModal
        visible={isLogMatchModalVisible}
        saving={isSaving}
        onClose={() => setIsLogMatchModalVisible(false)}
        onSave={saveMatch}
      />

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
