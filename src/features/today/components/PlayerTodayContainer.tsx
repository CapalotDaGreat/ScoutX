import { type OnboardingStep } from '@/features/player-onboarding/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrialInvitation } from '@/features/trial-invitations/types';
import { TodaySection, type TodayActionHandler } from '@/features/today/components/TodaySection';
import { useTodayPlan } from '@/features/today/hooks/useTodayPlan';

export type PlayerTodayContainerProps = {
  userId: string | null;
  profile: PlayerProfile | null;
  trials: TrialInvitation[];
  onboardingSteps: OnboardingStep[];
  onAction: TodayActionHandler;
};

export function PlayerTodayContainer({
  userId,
  profile,
  trials,
  onboardingSteps,
  onAction,
}: PlayerTodayContainerProps) {
  const { plan, latestAnalysis, upcomingTrial, analysesUnavailable, isLoading } = useTodayPlan({
    userId,
    profile,
    trials,
    onboardingSteps,
  });

  return (
    <TodaySection
      plan={plan}
      latestAnalysis={latestAnalysis}
      upcomingTrial={upcomingTrial}
      analysesUnavailable={analysesUnavailable}
      isLoading={isLoading}
      onAction={onAction}
    />
  );
}
