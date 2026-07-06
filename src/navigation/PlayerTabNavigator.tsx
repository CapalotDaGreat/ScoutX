import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BarChart3, CalendarDays, MapPin, Route, UserRound } from 'lucide-react-native';
import { buildPerformanceContext } from '@/features/ai-insights';
import { CareerScreen } from '@/features/career-timeline/components/CareerScreen';
import { EditJourneyModal } from '@/features/football-journey';
import { HighlightVideosManagerModal } from '@/features/highlight-videos';
import { PlayerProfileScreen, EditProfileModal } from '@/features/player-profile';
import { usePlayerOnboarding } from '@/features/player-onboarding';
import { type OnboardingStepId } from '@/features/player-onboarding/types';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { appendSystemJourneyEvents } from '@/features/career-timeline/services/careerTimelineService';
import { LogMatchModal, StatisticsScreen } from '@/features/player-statistics';
import { GpsTrackingScreen } from '@/features/gps';
import { PlayerTrialsScreen } from '@/features/trial-invitations';
import {
  RequestCoachEndorsementSheet,
  SharePortfolioSheet,
} from '@/features/public-portfolio';
import { exportFootballCvPdf } from '@/features/public-portfolio/services/footballCvExportService';
import { ActivityInboxModal } from '@/features/activity-feed';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { createNavigationTabBar } from '@/navigation/NavigationTabBar';
import { type PlayerStackParamList, type PlayerTabParamList } from '@/navigation/types';

const Tab = createBottomTabNavigator<PlayerTabParamList>();

type PlayerTabId = keyof PlayerTabParamList;

const PlayerTabBar = createNavigationTabBar<PlayerTabId>({
  tabs: [
    { id: 'Portfolio', label: 'Portfolio', icon: UserRound },
    { id: 'Career', label: 'Career', icon: Route },
    { id: 'Statistics', label: 'Stats', icon: BarChart3 },
    { id: 'Gps', label: 'GPS', icon: MapPin },
    { id: 'Trials', label: 'Trials', icon: CalendarDays },
  ],
  testID: 'player-tab-bar',
});

function usePlayerStackNavigation() {
  return useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
}

function PlayerTabsContainer() {
  const stackNavigation = usePlayerStackNavigation();
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
    trustState,
    portfolioPreview,
  } = usePlayerWorkspace();
  const { report: onboardingReport, shouldShow: shouldShowOnboarding, dismiss: dismissOnboarding } =
    usePlayerOnboarding(profile, trustState.recommendations.length);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isJourneyModalVisible, setIsJourneyModalVisible] = useState(false);
  const [isVideosModalVisible, setIsVideosModalVisible] = useState(false);
  const [isLogMatchModalVisible, setIsLogMatchModalVisible] = useState(false);
  const [isActivityInboxVisible, setIsActivityInboxVisible] = useState(false);
  const [isSharePortfolioVisible, setIsSharePortfolioVisible] = useState(false);
  const [isCoachInviteVisible, setIsCoachInviteVisible] = useState(false);

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

  const handlePrivacyChange = useCallback(
    async (privacy: NonNullable<typeof profile>['privacy']) => {
      if (!profile) {
        await saveProfile({ privacy });
        return;
      }

      let nextJourney = profile.footballJourney;
      if (privacy?.publicPortfolioEnabled && !profile.privacy?.publicPortfolioEnabled) {
        nextJourney = appendSystemJourneyEvents(nextJourney, { type: 'portfolio_enabled' });
      }
      if (privacy?.discoverableByScouts && !profile.privacy?.discoverableByScouts) {
        nextJourney = appendSystemJourneyEvents(nextJourney, { type: 'discoverable_enabled' });
      }

      await saveProfile({
        privacy,
        ...(nextJourney !== profile.footballJourney ? { footballJourney: nextJourney } : {}),
      });
    },
    [profile, saveProfile],
  );

  const handleOnboardingStepPress = useCallback(
    (stepId: OnboardingStepId) => {
      switch (stepId) {
        case 'log_first_match':
          openLogMatch();
          break;
        case 'claim_username':
          break;
        case 'enable_passport':
        case 'enable_discoverable':
          break;
        case 'invite_coach':
          setIsCoachInviteVisible(true);
          break;
        default:
          break;
      }
    },
    [openLogMatch],
  );

  return (
    <>
      <Tab.Navigator
        tabBar={(props: BottomTabBarProps) => <PlayerTabBar {...props} />}
        screenOptions={{ headerShown: false, lazy: true }}
      >
        <Tab.Screen name="Portfolio">
          {() => (
            <PlayerProfileScreen
              profile={profile}
              loading={isLoading}
              error={error}
              trustState={trustState}
              onRetry={refreshProfile}
              onEditPress={() => setIsEditModalVisible(true)}
              onEditJourneyPress={() => setIsJourneyModalVisible(true)}
              onManageVideosPress={() => setIsVideosModalVisible(true)}
              onLogMatchPress={openLogMatch}
              onActivityPress={() => setIsActivityInboxVisible(true)}
              onPortfolioPress={() =>
                user?.id
                  ? stackNavigation.navigate('PublicPortfolio', {
                      playerId: user.id,
                      slug: profile?.username,
                      previewMode: true,
                    })
                  : undefined
              }
              onSharePortfolioPress={() => setIsSharePortfolioVisible(true)}
              onInviteCoachPress={() => setIsCoachInviteVisible(true)}
              onExportCvPress={
                portfolioPreview
                  ? () => void exportFootballCvPdf(portfolioPreview)
                  : undefined
              }
              onboardingReport={shouldShowOnboarding ? onboardingReport : null}
              onOnboardingStepPress={handleOnboardingStepPress}
              onDismissOnboarding={() => void dismissOnboarding()}
              onUsernameClaimed={async (username) => {
                await saveProfile({ username });
                await refreshProfile();
              }}
              onPrivacyChange={handlePrivacyChange}
              onSettingsPress={() => stackNavigation.navigate('Settings')}
              onSignOut={() => void signOut()}
              embeddedInTabShell
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Career">
          {() => (
            <CareerScreen
              embeddedInTabShell
              onEditJourneyPress={() => setIsJourneyModalVisible(true)}
              onCareerReplayPress={() => stackNavigation.navigate('CareerReplay')}
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

      {user?.id && profile ? (
        <>
          <SharePortfolioSheet
            visible={isSharePortfolioVisible}
            playerId={user.id}
            playerName={profile.fullName}
            username={profile.username}
            onClose={() => setIsSharePortfolioVisible(false)}
          />
          <RequestCoachEndorsementSheet
            visible={isCoachInviteVisible}
            playerId={user.id}
            playerName={profile.fullName}
            username={profile.username}
            onClose={() => setIsCoachInviteVisible(false)}
          />
        </>
      ) : null}
    </>
  );
}

export function PlayerTabNavigator() {
  return <PlayerTabsContainer />;
}
