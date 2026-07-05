import { useEffect, useMemo, useState } from 'react';
import { type PlayerProfile } from '@/features/player-profile/types';
import {
  buildOnboardingReport,
  dismissOnboarding,
  readOnboardingDismissed,
} from '@/features/player-onboarding/services/onboardingService';
import { type PlayerOnboardingReport } from '@/features/player-onboarding/types';

export type UsePlayerOnboardingResult = {
  report: PlayerOnboardingReport | null;
  isDismissed: boolean;
  shouldShow: boolean;
  dismiss: () => Promise<void>;
};

export function usePlayerOnboarding(
  profile: PlayerProfile | null,
  coachRecommendations: number,
): UsePlayerOnboardingResult {
  const [isDismissed, setIsDismissed] = useState(false);

  const report = useMemo(() => {
    if (!profile) {
      return null;
    }
    return buildOnboardingReport(profile, coachRecommendations);
  }, [coachRecommendations, profile]);

  useEffect(() => {
    if (!profile?.id) {
      setIsDismissed(false);
      return;
    }

    void readOnboardingDismissed(profile.id).then(setIsDismissed);
  }, [profile?.id]);

  const shouldShow = Boolean(report && !report.isComplete && !isDismissed);

  const dismiss = async () => {
    if (!profile?.id) {
      return;
    }
    await dismissOnboarding(profile.id);
    setIsDismissed(true);
  };

  return { report, isDismissed, shouldShow, dismiss };
}
