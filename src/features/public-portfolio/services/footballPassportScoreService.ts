import { hasPrivacyPolicyUrl, hasTermsOfServiceUrl } from '@/config/legal';
import { isProductionMonitoringReady } from '@/config/productionReadiness';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrustRecommendation } from '@/features/trust-system/types';

export type PassportScoreItem = {
  id: string;
  label: string;
  complete: boolean;
  hint: string;
  weight: number;
};

export type PassportScoreSectionId = 'complete' | 'shareable' | 'scoutVisible' | 'launchReady';

export type PassportScoreSection = {
  id: PassportScoreSectionId;
  title: string;
  subtitle: string;
  score: number;
  items: PassportScoreItem[];
};

export type FootballPassportScoreReport = {
  overallScore: number;
  grade: string;
  sections: PassportScoreSection[];
  focusHints: string[];
};

function gradeFromScore(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

function computeWeightedScore(items: PassportScoreItem[]): number {
  if (items.length === 0) {
    return 0;
  }
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const earned = items.filter((item) => item.complete).reduce((sum, item) => sum + item.weight, 0);
  return Math.round((earned / totalWeight) * 100);
}

function readPrivacyPolicyUrl(): boolean {
  return hasPrivacyPolicyUrl();
}

function readTermsOfServiceUrl(): boolean {
  return hasTermsOfServiceUrl();
}

function buildCompleteSection(profile: PlayerProfile): PassportScoreSection {
  const items: PassportScoreItem[] = [
    {
      id: 'avatar',
      label: 'Profile photo',
      complete: Boolean(profile.avatarUrl),
      weight: 10,
      hint: 'Add a professional headshot.',
    },
    {
      id: 'bio',
      label: 'Player story',
      complete: profile.biography.trim().length > 20,
      weight: 12,
      hint: 'Write a short biography scouts can trust.',
    },
    {
      id: 'position',
      label: 'Primary position',
      complete: profile.identity.preferredPositions.length > 0,
      weight: 10,
      hint: 'Set your preferred positions.',
    },
    {
      id: 'club',
      label: 'Current club',
      complete: profile.club.trim().length > 0 && profile.club !== 'Free Agent',
      weight: 8,
      hint: 'Add your current club or academy.',
    },
    {
      id: 'matches',
      label: 'Match history',
      complete: (profile.statisticsMatches?.length ?? 0) > 0,
      weight: 15,
      hint: 'Log at least one match.',
    },
    {
      id: 'videos',
      label: 'Highlight video',
      complete: (profile.highlightVideos?.videos.length ?? 0) > 0,
      weight: 15,
      hint: 'Upload a highlight reel.',
    },
    {
      id: 'journey',
      label: 'Career timeline',
      complete: (profile.footballJourney?.entries.length ?? 0) > 0,
      weight: 10,
      hint: 'Add a journey or milestone entry.',
    },
  ];

  return {
    id: 'complete',
    title: 'Profile complete',
    subtitle: 'Core identity scouts expect on every passport',
    score: computeWeightedScore(items),
    items,
  };
}

function buildShareableSection(profile: PlayerProfile): PassportScoreSection {
  const items: PassportScoreItem[] = [
    {
      id: 'username',
      label: 'Custom portfolio link',
      complete: Boolean(profile.username && profile.username.length >= 3),
      weight: 50,
      hint: 'Claim pitchproof.online/player/your-name.',
    },
    {
      id: 'public',
      label: 'Public Football Passport',
      complete: profile.privacy?.publicPortfolioEnabled ?? false,
      weight: 50,
      hint: 'Enable your shareable Football Passport.',
    },
  ];

  return {
    id: 'shareable',
    title: 'Shareable',
    subtitle: 'Ready to share your link-in-bio',
    score: computeWeightedScore(items),
    items,
  };
}

function buildScoutVisibleSection(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[],
): PassportScoreSection {
  const coachRecs = recommendations.filter((item) => item.type === 'coach_recommendation');
  const recentMatch = (profile.statisticsMatches ?? []).some((match) => {
    const days = (Date.now() - new Date(match.date).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 45;
  });

  const items: PassportScoreItem[] = [
    {
      id: 'discoverable',
      label: 'Discoverable by scouts',
      complete: profile.privacy?.discoverableByScouts ?? false,
      weight: 25,
      hint: 'Opt in to scout discovery search.',
    },
    {
      id: 'coach',
      label: 'Coach endorsement',
      complete: coachRecs.length > 0,
      weight: 30,
      hint: 'Invite a coach to endorse you.',
    },
    {
      id: 'video',
      label: 'Highlight video for scouts',
      complete: (profile.highlightVideos?.videos.length ?? 0) > 0,
      weight: 20,
      hint: 'Upload at least one highlight clip.',
    },
    {
      id: 'match',
      label: 'Recent match logged',
      complete: recentMatch,
      weight: 25,
      hint: 'Log a match from the last 45 days.',
    },
  ];

  return {
    id: 'scoutVisible',
    title: 'Scout-visible',
    subtitle: 'Signals that help scouts trust and find you',
    score: computeWeightedScore(items),
    items,
  };
}

function buildLaunchReadySection(profile: PlayerProfile, pushRegistered: boolean): PassportScoreSection {
  const items: PassportScoreItem[] = [
    {
      id: 'public_portfolio',
      label: 'Public Football Passport enabled',
      complete: profile.privacy?.publicPortfolioEnabled ?? false,
      weight: 25,
      hint: 'Turn on your shareable passport before sharing links.',
    },
    {
      id: 'username',
      label: 'Custom portfolio URL claimed',
      complete: Boolean(profile.username && profile.username.length >= 3),
      weight: 25,
      hint: 'Claim pitchproof.online/player/your-name.',
    },
    {
      id: 'privacy_policy',
      label: 'Privacy policy URL configured',
      complete: readPrivacyPolicyUrl(),
      weight: 15,
      hint: 'Set extra.privacyPolicyUrl in app config before store submission.',
    },
    {
      id: 'terms',
      label: 'Terms of service URL configured',
      complete: readTermsOfServiceUrl(),
      weight: 15,
      hint: 'Set extra.termsOfServiceUrl in app config before store submission.',
    },
    {
      id: 'sentry',
      label: 'Crash reporting configured',
      complete: isProductionMonitoringReady(),
      weight: 20,
      hint: 'Set EXPO_PUBLIC_SENTRY_DSN for production crash reporting.',
    },
    {
      id: 'push',
      label: 'Push notifications registered',
      complete: pushRegistered,
      weight: 25,
      hint: 'Enable push to get alerts when scouts view your passport.',
    },
  ];

  return {
    id: 'launchReady',
    title: 'Store ready',
    subtitle: 'Pre-launch checklist for App Store / Play Store',
    score: computeWeightedScore(items),
    items,
  };
}

export function buildFootballPassportScoreReport(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[] = [],
  pushRegistered = false,
): FootballPassportScoreReport {
  const sections = [
    buildCompleteSection(profile),
    buildShareableSection(profile),
    buildScoutVisibleSection(profile, recommendations),
    buildLaunchReadySection(profile, pushRegistered),
  ];

  const overallScore = Math.round(
    sections.reduce((sum, section) => sum + section.score, 0) / sections.length,
  );

  const focusHints = sections
    .flatMap((section) => section.items.filter((item) => !item.complete).map((item) => item.hint))
    .slice(0, 4);

  return {
    overallScore,
    grade: gradeFromScore(overallScore),
    sections,
    focusHints,
  };
}

export function getPortfolioOverallScore(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[] = [],
  pushRegistered = false,
): number {
  return buildFootballPassportScoreReport(profile, recommendations, pushRegistered).overallScore;
}
