import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Activity, Clapperboard, Compass, Home } from 'lucide-react-native';
import { EditJourneyModal } from '@/features/football-journey';
import { HighlightVideosManagerModal } from '@/features/highlight-videos';
import { HighlightReelStudioModal } from '@/features/highlight-reel-studio';
import { MatchAnalysisModal } from '@/features/match-analysis';
import { PlayerProfileScreen, EditProfileModal } from '@/features/player-profile';
import { usePlayerOnboarding } from '@/features/player-onboarding';
import { type OnboardingStepId } from '@/features/player-onboarding/types';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { LogMatchModal } from '@/features/player-statistics';
import {
  RequestCoachEndorsementSheet,
  SharePortfolioSheet,
} from '@/features/public-portfolio';
import { exportFootballCvPdf } from '@/features/public-portfolio/services/footballCvExportService';
import { ActivityInboxModal } from '@/features/activity-feed';
import { usePlayerTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { createNavigationTabBar } from '@/navigation/NavigationTabBar';
import { PlayerDiscoverTab } from '@/navigation/PlayerDiscoverTab';
import { PlayerMediaTab } from '@/navigation/PlayerMediaTab';
import { PlayerPerformanceTab } from '@/navigation/PlayerPerformanceTab';
import { type PlayerStackParamList, type PlayerTabParamList } from '@/navigation/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const Tab = createBottomTabNavigator<PlayerTabParamList>();

type PlayerTabId = keyof PlayerTabParamList;

function createDynamicPlayerTabBar(onLogMatch: () => void, logMatchLabel: string) {
  function PlayerTabBarComponent(props: BottomTabBarProps) {
    const { t, i18n } = useAppTranslation('navigation');
    const TabBar = useMemo(() => {
      return createNavigationTabBar<PlayerTabId>({
        tabs: [
          { id: 'Home', label: t('tabs.home'), icon: Home },
          { id: 'Performance', label: t('tabs.performance'), icon: Activity },
          { id: 'Media', label: t('tabs.media'), icon: Clapperboard },
          { id: 'Discover', label: t('tabs.discover'), icon: Compass },
        ],
        onCenterAction: onLogMatch,
        centerActionLabel: logMatchLabel,
        testID: 'player-tab-bar',
      });
    }, [t, i18n.language]) as ComponentType<BottomTabBarProps>;

    return <TabBar {...props} />;
  }

  return PlayerTabBarComponent;
}

function usePlayerStackNavigation() {
  return useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
}

function PlayerTabsContainer() {
  const stackNavigation = usePlayerStackNavigation();
  const { user } = useAuth();
  const { t } = useAppTranslation(['common', 'statistics']);
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
  const { trials } = usePlayerTrialInvitations();
  const pendingTrialsCount = useMemo(
    () => trials.filter((trial) => trial.status === 'pending').length,
    [trials],
  );

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isJourneyModalVisible, setIsJourneyModalVisible] = useState(false);
  const [isVideosModalVisible, setIsVideosModalVisible] = useState(false);
  const [isMatchAnalysisVisible, setIsMatchAnalysisVisible] = useState(false);
  const [isHighlightReelStudioVisible, setIsHighlightReelStudioVisible] = useState(false);
  const [isLogMatchModalVisible, setIsLogMatchModalVisible] = useState(false);
  const [isActivityInboxVisible, setIsActivityInboxVisible] = useState(false);
  const [isSharePortfolioVisible, setIsSharePortfolioVisible] = useState(false);
  const [isCoachInviteVisible, setIsCoachInviteVisible] = useState(false);
  const [passportSettingsFocusKey, setPassportSettingsFocusKey] = useState<number | null>(null);

  const openMatchAnalysis = useCallback(() => {
    setIsMatchAnalysisVisible(true);
  }, []);

  const openLogMatch = useCallback(() => {
    setIsLogMatchModalVisible(true);
  }, []);

  const focusPassportUsername = useCallback(() => {
    setPassportSettingsFocusKey(Date.now());
  }, []);

  const PlayerTabBar = useMemo(
    () => createDynamicPlayerTabBar(openLogMatch, t('statistics:logMatch')),
    [openLogMatch, t],
  );

  const handleOnboardingStepPress = useCallback(
    (stepId: OnboardingStepId) => {
      switch (stepId) {
        case 'log_first_match':
          openLogMatch();
          break;
        case 'claim_username':
          focusPassportUsername();
          break;
        case 'enable_passport':
        case 'enable_discoverable':
          stackNavigation.navigate('Settings');
          break;
        case 'invite_coach':
          setIsCoachInviteVisible(true);
          break;
        default:
          break;
      }
    },
    [focusPassportUsername, openLogMatch, stackNavigation],
  );

  return (
    <>
      <Tab.Navigator
        initialRouteName="Home"
        tabBar={(props: BottomTabBarProps) => <PlayerTabBar {...props} />}
        screenOptions={{ headerShown: false, lazy: true }}
      >
        <Tab.Screen name="Home">
          {({ navigation: tabNavigation }) => (
            <PlayerProfileScreen
              profile={profile}
              loading={isLoading}
              error={error}
              trustState={trustState}
              onRetry={refreshProfile}
              onEditPress={() => setIsEditModalVisible(true)}
              onLogMatchPress={openLogMatch}
              onViewPerformancePress={() => tabNavigation.navigate('Performance')}
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
              onTrialsPress={() => stackNavigation.navigate('Trials')}
              pendingTrialsCount={pendingTrialsCount}
              onboardingReport={shouldShowOnboarding ? onboardingReport : null}
              onOnboardingStepPress={handleOnboardingStepPress}
              onDismissOnboarding={() => void dismissOnboarding()}
              onUsernameClaimed={async (username) => {
                await saveProfile({ username });
                await refreshProfile();
              }}
              passportSettingsFocusKey={passportSettingsFocusKey}
              onSettingsPress={() => stackNavigation.navigate('Settings')}
              embeddedInTabShell
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Performance">
          {() => (
            <PlayerPerformanceTab
              onLogMatchPress={openLogMatch}
              onEditJourneyPress={() => setIsJourneyModalVisible(true)}
              onAnalyzeMatchVideoPress={openMatchAnalysis}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Media">
          {() => (
            <PlayerMediaTab
              onManageVideosPress={() => setIsVideosModalVisible(true)}
              onAnalyzeMatchVideoPress={openMatchAnalysis}
              onOpenHighlightReelStudio={() => setIsHighlightReelStudioVisible(true)}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Discover" component={PlayerDiscoverTab} />
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
          onAnalyzeMatchVideoPress={() => {
            setIsVideosModalVisible(false);
            openMatchAnalysis();
          }}
          onOpenHighlightReelStudio={() => {
            setIsVideosModalVisible(false);
            setIsHighlightReelStudioVisible(true);
          }}
        />
      ) : null}

      <MatchAnalysisModal
        visible={isMatchAnalysisVisible}
        playerId={user?.id ?? null}
        onClose={() => setIsMatchAnalysisVisible(false)}
        onApplyStats={async (payload) => {
          await saveMatch(payload);
          await refreshProfile();
        }}
        onOpenHighlightReelStudio={() => {
          setIsMatchAnalysisVisible(false);
          setIsHighlightReelStudioVisible(true);
        }}
      />

      <HighlightReelStudioModal
        visible={isHighlightReelStudioVisible}
        playerId={user?.id ?? null}
        onClose={() => setIsHighlightReelStudioVisible(false)}
      />

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
