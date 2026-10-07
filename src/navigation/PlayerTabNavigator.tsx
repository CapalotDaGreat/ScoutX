import { useCallback, useMemo, useRef, useState, type ComponentType } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps, type BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Activity, Clapperboard, Compass, Home } from 'lucide-react-native';
import { RequestAttentionCard } from '@/features/request-center/components/RequestAttentionCard';
import { EditJourneyModal } from '@/features/football-journey';
import { HighlightVideosManagerModal } from '@/features/highlight-videos';
import { HighlightReelStudioModal } from '@/features/highlight-reel-studio';
import { MatchAnalysisModal } from '@/features/match-analysis';
import { PlayerProfileScreen, EditProfileModal } from '@/features/player-profile';
import { usePlayerOnboarding } from '@/features/player-onboarding';
import { type OnboardingStep, type OnboardingStepId } from '@/features/player-onboarding/types';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { PlayerTodayContainer } from '@/features/today/components/PlayerTodayContainer';
import { workflowEvents } from '@/features/today/services/workflowStores';
import { type TodayRoute } from '@/features/today/types';
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

const EMPTY_ONBOARDING_STEPS: OnboardingStep[] = [];
const EMPTY_MATCHES: PlayerMatchStatistics[] = [];
const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = [
  'log_first_match',
  'claim_username',
  'enable_passport',
  'invite_coach',
  'enable_discoverable',
];

function isOnboardingStepId(value: string | undefined): value is OnboardingStepId {
  return ONBOARDING_STEP_IDS.some((id) => id === value);
}

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
  const tabNavigationRef = useRef<BottomTabNavigationProp<PlayerTabParamList> | null>(null);
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

  const [matchAnalysisJobId, setMatchAnalysisJobId] = useState<string | null>(null);
  const [matchAnalysisPrefill, setMatchAnalysisPrefill] = useState<{
    opponent: string;
    competition: string;
    date: string;
  } | null>(null);

  const openMatchAnalysis = useCallback(() => {
    setMatchAnalysisJobId(null);
    setMatchAnalysisPrefill(null);
    setIsMatchAnalysisVisible(true);
  }, []);

  const closeMatchAnalysis = useCallback(() => {
    setIsMatchAnalysisVisible(false);
    setMatchAnalysisJobId(null);
    setMatchAnalysisPrefill(null);
    workflowEvents.emit();
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

  const handleTodayAction = useCallback(
    (route: TodayRoute, entityId?: string) => {
      switch (route) {
        case 'logMatch':
          openLogMatch();
          break;
        case 'matchAnalysis': {
          const loggedMatch = entityId
            ? profile?.statisticsMatches?.find((match) => match.id === entityId)
            : undefined;
          setMatchAnalysisJobId(loggedMatch ? null : (entityId ?? null));
          setMatchAnalysisPrefill(
            loggedMatch
              ? {
                  opponent: loggedMatch.opponent,
                  competition: loggedMatch.competition,
                  date: loggedMatch.date,
                }
              : null,
          );
          setIsMatchAnalysisVisible(true);
          break;
        }
        case 'highlightStudio':
          setIsHighlightReelStudioVisible(true);
          break;
        case 'manageVideos':
          setIsVideosModalVisible(true);
          break;
        case 'trials':
          stackNavigation.navigate('Trials');
          break;
        case 'passportSetup':
          if (isOnboardingStepId(entityId)) {
            handleOnboardingStepPress(entityId);
          }
          break;
        case 'development':
          tabNavigationRef.current?.navigate('Performance', { segment: 'development' });
          break;
      }
    },
    [handleOnboardingStepPress, openLogMatch, profile?.statisticsMatches, stackNavigation],
  );

  return (
    <>
      <Tab.Navigator
        initialRouteName="Home"
        tabBar={(props: BottomTabBarProps) => <PlayerTabBar {...props} />}
        screenOptions={{ headerShown: false, lazy: true }}
      >
        <Tab.Screen name="Home">
          {({ navigation: tabNavigation }) => {
            tabNavigationRef.current = tabNavigation;
            return (
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
              onSearchPress={() => stackNavigation.navigate('GlobalSearch')}
              embeddedInTabShell
              todaySlot={
                <View className="gap-4">
                <RequestAttentionCard
                  onViewAll={() => stackNavigation.navigate('RequestCenter')}
                  onOpenTrial={(trialId) => stackNavigation.navigate('Trials', { trialId })}
                />
                <PlayerTodayContainer
                  userId={user?.id ?? null}
                  profile={profile}
                  trials={trials}
                  onboardingSteps={onboardingReport?.steps ?? EMPTY_ONBOARDING_STEPS}
                  recommendations={trustState.recommendations}
                  trustProfile={trustState.trustProfile}
                  onAction={handleTodayAction}
                />
                </View>
              }
            />
          );
          }}
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
          {({ route }) => (
            <PlayerMediaTab
              focusReelId={route.params?.reelId}
              onManageVideosPress={() => setIsVideosModalVisible(true)}
              onAnalyzeMatchVideoPress={openMatchAnalysis}
              onOpenHighlightReelStudio={() => setIsHighlightReelStudioVisible(true)}
              onViewEvidence={(jobId) => stackNavigation.navigate('AnalysisReport', { jobId })}
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
        initialJobId={matchAnalysisJobId}
        prefillMatch={matchAnalysisPrefill}
        onClose={closeMatchAnalysis}
        onApplyStats={async (payload) => {
          await saveMatch(payload);
          await refreshProfile();
        }}
        onOpenHighlightReelStudio={() => {
          closeMatchAnalysis();
          setIsHighlightReelStudioVisible(true);
        }}
        onOpenReport={(jobId) => {
          closeMatchAnalysis();
          stackNavigation.navigate('AnalysisReport', { jobId });
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
        previousMatches={profile?.statisticsMatches ?? EMPTY_MATCHES}
        profilePosition={profile?.position ?? ''}
        userId={user?.id ?? null}
        onNextStep={(step, payload) => {
          if (step === 'analyze') {
            setMatchAnalysisJobId(null);
            setMatchAnalysisPrefill({ opponent: payload.opponent, competition: payload.competition, date: payload.date });
            setIsMatchAnalysisVisible(true);
          } else if (step === 'uploadVideo') {
            setIsVideosModalVisible(true);
          } else {
            tabNavigationRef.current?.navigate('Performance', { segment: 'development' });
          }
        }}
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
