import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { buildPerformanceContext } from '@/features/ai-insights';
import { EditJourneyModal } from '@/features/football-journey';
import { HighlightVideosManagerModal } from '@/features/highlight-videos';
import { PlayerProfileScreen, EditProfileModal, usePlayerProfile } from '@/features/player-profile';
import { LogMatchModal, StatisticsScreen } from '@/features/player-statistics';
import { GpsTrackingScreen } from '@/features/gps';
import { PlayerTrialsScreen } from '@/features/trial-invitations';

export type PlayerAuthenticatedScreenProps = {
  onSignOut: () => Promise<void>;
};

type PlayerView = 'profile' | 'statistics' | 'gps' | 'trials';

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
  const [isJourneyModalVisible, setIsJourneyModalVisible] = useState(false);
  const [isVideosModalVisible, setIsVideosModalVisible] = useState(false);
  const [isLogMatchModalVisible, setIsLogMatchModalVisible] = useState(false);

  const statisticsAiContext = useMemo(() => {
    if (!user?.id || !profile) {
      return null;
    }

    return buildPerformanceContext(
      {
        playerId: user.id,
        playerName: profile.fullName,
        position: profile.position ? [profile.position] : undefined,
        club: profile.club,
        nationality: profile.nationality,
      },
      profile.statisticsMatches ?? [],
    );
  }, [profile, user?.id]);

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
        <Button
          variant={activeView === 'trials' ? 'primary' : 'secondary'}
          className="flex-1"
          onPress={() => setActiveView('trials')}
        >
          Trials
        </Button>
      </View>

      {activeView === 'profile' ? (
        <PlayerProfileScreen
          profile={profile}
          loading={isLoading}
          error={error}
          onRetry={refreshProfile}
          onEditPress={() => setIsEditModalVisible(true)}
          onEditJourneyPress={() => setIsJourneyModalVisible(true)}
          onManageVideosPress={() => setIsVideosModalVisible(true)}
          onLogMatchPress={() => setIsLogMatchModalVisible(true)}
        />
      ) : null}

      {activeView === 'statistics' ? (
        <StatisticsScreen
          matches={profile?.statisticsMatches}
          aiInsightContext={statisticsAiContext}
          onLogMatchPress={() => setIsLogMatchModalVisible(true)}
          onRefresh={refreshProfile}
          refreshing={isLoading}
        />
      ) : null}

      {activeView === 'gps' ? <GpsTrackingScreen playerId={user?.id ?? null} /> : null}

      {activeView === 'trials' ? <PlayerTrialsScreen /> : null}

      {profile ? (
        <EditProfileModal
          visible={isEditModalVisible}
          profile={profile}
          onClose={() => setIsEditModalVisible(false)}
          onSave={saveProfile}
          onUploadImage={uploadImage}
        />
      ) : null}

      {profile ? (
        <EditJourneyModal
          visible={isJourneyModalVisible}
          profile={profile}
          onClose={() => setIsJourneyModalVisible(false)}
          onSave={saveProfile}
        />
      ) : null}

      {profile ? (
        <HighlightVideosManagerModal
          visible={isVideosModalVisible}
          profile={profile}
          onClose={() => setIsVideosModalVisible(false)}
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
