import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PlayerProfile } from '@/features/player-profile/types';
import {
  type OnboardingStep,
  type OnboardingStepId,
  type PlayerOnboardingReport,
} from '@/features/player-onboarding/types';

const STORAGE_PREFIX = '@scoutx/player-onboarding/';

export function buildOnboardingSteps(
  profile: PlayerProfile,
  coachRecommendations: number,
): OnboardingStep[] {
  return [
    {
      id: 'log_first_match',
      title: 'Log your first match',
      description: 'Start your performance story with real match data.',
      complete: (profile.statisticsMatches?.length ?? 0) > 0,
    },
    {
      id: 'claim_username',
      title: 'Claim your portfolio link',
      description: 'Get a shareable scoutx.app/player/your-name URL.',
      complete: Boolean(profile.username && profile.username.length >= 3),
    },
    {
      id: 'enable_passport',
      title: 'Publish your Football Passport',
      description: 'Make your portfolio public and ready to share.',
      complete: profile.privacy?.publicPortfolioEnabled ?? false,
    },
    {
      id: 'invite_coach',
      title: 'Invite a coach endorsement',
      description: 'Add trusted voice to your Football Passport.',
      complete: coachRecommendations > 0,
    },
    {
      id: 'enable_discoverable',
      title: 'Opt in to scout discovery',
      description: 'Appear in scout search when you are ready.',
      complete: profile.privacy?.discoverableByScouts ?? false,
    },
  ];
}

export function buildOnboardingReport(
  profile: PlayerProfile,
  coachRecommendations: number,
): PlayerOnboardingReport {
  const steps = buildOnboardingSteps(profile, coachRecommendations);
  const completedCount = steps.filter((step) => step.complete).length;
  return {
    steps,
    completedCount,
    totalCount: steps.length,
    isComplete: completedCount === steps.length,
  };
}

export async function readOnboardingDismissed(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(`${STORAGE_PREFIX}${userId}/dismissed`);
  return value === 'true';
}

export async function dismissOnboarding(userId: string): Promise<void> {
  await AsyncStorage.setItem(`${STORAGE_PREFIX}${userId}/dismissed`, 'true');
}

export async function readOnboardingSeenSteps(userId: string): Promise<OnboardingStepId[]> {
  const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${userId}/seen-steps`);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is OnboardingStepId => typeof item === 'string');
  } catch {
    return [];
  }
}

export async function markOnboardingStepSeen(
  userId: string,
  stepId: OnboardingStepId,
): Promise<void> {
  const existing = await readOnboardingSeenSteps(userId);
  if (existing.includes(stepId)) {
    return;
  }
  await AsyncStorage.setItem(
    `${STORAGE_PREFIX}${userId}/seen-steps`,
    JSON.stringify([...existing, stepId]),
  );
}
