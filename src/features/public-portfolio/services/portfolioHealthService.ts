import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { buildFootballPassportScoreReport } from '@/features/public-portfolio/services/footballPassportScoreService';

export type PortfolioHealthItem = {
  id: string;
  label: string;
  complete: boolean;
  weight: number;
  hint: string;
};

export type PortfolioHealthReport = {
  score: number;
  grade: string;
  completionPercent: number;
  items: PortfolioHealthItem[];
};

export type ScoutReadinessReport = {
  score: number;
  items: PortfolioHealthItem[];
};

/** @deprecated Prefer buildFootballPassportScoreReport for new code. */
export function buildPortfolioHealthReport(profile: PlayerProfile): PortfolioHealthReport {
  const report = buildFootballPassportScoreReport(profile);
  const section = report.sections.find((item) => item.id === 'complete');
  const items = section?.items ?? [];

  return {
    score: section?.score ?? report.overallScore,
    grade: report.grade,
    completionPercent: section?.score ?? report.overallScore,
    items,
  };
}

/** @deprecated Prefer buildFootballPassportScoreReport for new code. */
export function buildScoutReadinessReport(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[],
): ScoutReadinessReport {
  const report = buildFootballPassportScoreReport(profile, recommendations);
  const section = report.sections.find((item) => item.id === 'scoutVisible');
  return {
    score: section?.score ?? 0,
    items: section?.items ?? [],
  };
}

export function getPortfolioOverallScore(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[] = [],
  pushRegistered = false,
): number {
  return buildFootballPassportScoreReport(profile, recommendations, pushRegistered).overallScore;
}
