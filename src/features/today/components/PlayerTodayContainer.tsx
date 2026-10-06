import { type OnboardingStep } from '@/features/player-onboarding/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { type TrustProfile, type TrustRecommendation } from '@/features/trust-system/types';
import { TodaySection, type TodayActionHandler } from '@/features/today/components/TodaySection';
import { useTodayPlan } from '@/features/today/hooks/useTodayPlan';

export type PlayerTodayContainerProps = {
  userId: string | null;
  profile: PlayerProfile | null;
  trials: TrialInvitation[];
  onboardingSteps: OnboardingStep[];
  recommendations?: TrustRecommendation[];
  trustProfile?: TrustProfile | null;
  onAction: TodayActionHandler;
};

export function PlayerTodayContainer({
  userId,
  profile,
  trials,
  onboardingSteps,
  recommendations,
  trustProfile,
  onAction,
}: PlayerTodayContainerProps) {
  const {
    plan,
    latestAnalysis,
    upcomingTrial,
    changes,
    goalFocus,
    evidence,
    markChangesSeen,
    analysesUnavailable,
    isLoading,
  } = useTodayPlan({
    userId,
    profile,
    trials,
    onboardingSteps,
    recommendations,
    trustProfile,
  });

  return (
    <TodaySection
      plan={plan}
      latestAnalysis={latestAnalysis}
      upcomingTrial={upcomingTrial}
      changes={changes}
      goalFocus={goalFocus}
      evidence={evidence}
      onChangesSeen={markChangesSeen}
      analysesUnavailable={analysesUnavailable}
      isLoading={isLoading}
      onAction={onAction}
    />
  );
}
