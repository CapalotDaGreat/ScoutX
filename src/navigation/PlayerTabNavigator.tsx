import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BarChart3, CalendarDays, MapPin, UserRound } from 'lucide-react-native';
import { buildPerformanceContext } from '@/features/ai-insights';
import { EditJourneyModal } from '@/features/football-journey';
import { HighlightVideosManagerModal } from '@/features/highlight-videos';
import { PlayerProfileScreen, EditProfileModal, usePlayerProfile } from '@/features/player-profile';
import { LogMatchModal, StatisticsScreen } from '@/features/player-statistics';
import { GpsTrackingScreen } from '@/features/gps';
import { PlayerTrialsScreen } from '@/features/trial-invitations';
import { ActivityInboxModal } from '@/features/activity-feed';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { createNavigationTabBar } from '@/navigation/NavigationTabBar';
import { type PlayerTabParamList } from '@/navigation/types';

const Tab = createBottomTabNavigator<PlayerTabParamList>();

type PlayerTabId = keyof PlayerTabParamList;

const PlayerTabBar = createNavigationTabBar<PlayerTabId>({
  tabs: [
    { id: 'Profile', label: 'Profile', icon: UserRound },
    { id: 'Statistics', label: 'Stats', icon: BarChart3 },
    { id: 'Gps', label: 'GPS', icon: MapPin },
    { id: 'Trials', label: 'Trials', icon: CalendarDays },
  ],
  testID: 'player-tab-bar',
});

function PlayerTabsContainer() {
  const { user, signOut } = useAuth();
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
  const [isJourneyModalVisible, setIsJourneyModalVisible] = useState(false);
  const [isVideosModalVisible, setIsVideosModalVisible] = useState(false);
  const [isLogMatchModalVisible, setIsLogMatchModalVisible] = useState(false);
  const [isActivityInboxVisible, setIsActivityInboxVisible] = useState(false);

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

  const openLogMatch = useCallback(() => {
    setIsLogMatchModalVisible(true);
  }, []);

  return (
    <>
      <Tab.Navigator
        tabBar={(props: BottomTabBarProps) => <PlayerTabBar {...props} />}
        screenOptions={{ headerShown: false, lazy: true }}
      >
        <Tab.Screen name="Profile">
          {() => (
            <PlayerProfileScreen
              profile={profile}
              loading={isLoading}
              error={error}
              onRetry={refreshProfile}
              onEditPress={() => setIsEditModalVisible(true)}
              onEditJourneyPress={() => setIsJourneyModalVisible(true)}
              onManageVideosPress={() => setIsVideosModalVisible(true)}
              onLogMatchPress={openLogMatch}
              onActivityPress={() => setIsActivityInboxVisible(true)}
              onSignOut={() => void signOut()}
              embeddedInTabShell
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Statistics">
          {() => (
            <StatisticsScreen
              matches={profile?.statisticsMatches}
              aiInsightContext={statisticsAiContext}
              onLogMatchPress={openLogMatch}
              onRefresh={refreshProfile}
              refreshing={isLoading}
              embeddedInTabShell
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Gps">
          {() => <GpsTrackingScreen playerId={user?.id ?? null} embeddedInTabShell />}
        </Tab.Screen>
        <Tab.Screen name="Trials">
          {() => <PlayerTrialsScreen embeddedInTabShell />}
        </Tab.Screen>
      </Tab.Navigator>

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

      <ActivityInboxModal
        visible={isActivityInboxVisible}
        onClose={() => setIsActivityInboxVisible(false)}
      />
    </>
  );
}

export function PlayerTabNavigator() {
  return <PlayerTabsContainer />;
}
