import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { PlayerProfileScreen, EditProfileModal, usePlayerProfile } from '@/features/player-profile';
import { LogMatchModal } from '@/features/player-statistics';

export type AuthenticatedScreenProps = {
  onSignOut: () => Promise<void>;
};

export function AuthenticatedScreen({ onSignOut }: AuthenticatedScreenProps) {
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
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isLogMatchModalVisible, setIsLogMatchModalVisible] = useState(false);

  return (
    <View className="flex-1">
      <PlayerProfileScreen
        profile={profile}
        loading={isLoading}
        error={error}
        onRetry={refreshProfile}
        onEditPress={() => setIsEditModalVisible(true)}
        onLogMatchPress={() => setIsLogMatchModalVisible(true)}
      />

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

