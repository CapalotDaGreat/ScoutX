import { hasPrivacyPolicyUrl, hasTermsOfServiceUrl } from '@/config/legal';
import { isProductionMonitoringReady } from '@/config/productionReadiness';
import { type PlayerProfile } from '@/features/player-profile/types';

export type LaunchReadinessItem = {
  id: string;
  label: string;
  complete: boolean;
  hint: string;
};

export type LaunchReadinessReport = {
  score: number;
  items: LaunchReadinessItem[];
};

function computeScore(items: LaunchReadinessItem[]): number {
  if (items.length === 0) {
    return 0;
  }
  const complete = items.filter((item) => item.complete).length;
  return Math.round((complete / items.length) * 100);
}

export function buildLaunchReadinessReport(
  profile: PlayerProfile,
  pushRegistered: boolean,
): LaunchReadinessReport {
  const items: LaunchReadinessItem[] = [
    {
      id: 'public_portfolio',
      label: 'Public Football Passport enabled',
      complete: profile.privacy?.publicPortfolioEnabled ?? false,
      hint: 'Turn on your shareable passport before sharing links.',
    },
    {
      id: 'username',
      label: 'Custom portfolio URL claimed',
      complete: Boolean(profile.username && profile.username.length >= 3),
      hint: 'Claim scoutx.app/player/your-name for link-in-bio sharing.',
    },
    {
      id: 'avatar',
      label: 'Profile photo uploaded',
      complete: Boolean(profile.avatarUrl),
      hint: 'Add a professional headshot scouts can recognize.',
    },
    {
      id: 'bio',
      label: 'Player story written',
      complete: profile.biography.trim().length > 20,
      hint: 'Write a short biography for your Football Passport.',
    },
    {
      id: 'privacy_policy',
      label: 'Privacy policy URL configured',
      complete: hasPrivacyPolicyUrl(),
      hint: 'Set extra.privacyPolicyUrl in app config before store submission.',
    },
    {
      id: 'terms',
      label: 'Terms of service URL configured',
      complete: hasTermsOfServiceUrl(),
      hint: 'Set extra.termsOfServiceUrl in app config before store submission.',
    },
    {
      id: 'sentry',
      label: 'Crash reporting configured',
      complete: isProductionMonitoringReady(),
      hint: 'Set EXPO_PUBLIC_SENTRY_DSN for production crash reporting.',
    },
    {
      id: 'push',
      label: 'Push notifications registered',
      complete: pushRegistered,
      hint: 'Enable push to get alerts when scouts view your passport.',
    },
  ];

  return { score: computeScore(items), items };
}
