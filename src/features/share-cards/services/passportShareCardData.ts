import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { buildPublicPortfolioUrl } from '@/features/public-portfolio/constants';
import { filterPortfolioForPublicExport, isPortfolioSectionVisible } from '@/features/public-portfolio/models/PortfolioModel';

export type PassportShareCardData = {
  playerName: string;
  position: string;
  club: string;
  nationality: string;
  /** Null when statistics are hidden or unavailable — never invent zero. */
  goals: number | null;
  assists: number | null;
  matches: number | null;
  endorsements: number | null;
  portfolioUrl: string;
  tagline: string;
  includeStatistics: boolean;
  includeEndorsements: boolean;
};

export function buildPassportShareCardData(
  data: PublicPortfolioData,
  username?: string | null,
): PassportShareCardData | null {
  const filtered = filterPortfolioForPublicExport(data);
  if (!filtered) {
    return null;
  }
  const { profile, recommendations, privacy } = filtered;
  const includeStatistics = isPortfolioSectionVisible(privacy, 'statistics');
  const includeEndorsements = isPortfolioSectionVisible(privacy, 'recommendations');
  const matches = includeStatistics ? (profile.statisticsMatches ?? []) : [];

  return {
    playerName: profile.fullName,
    position: profile.position,
    club: profile.club || profile.identity.currentClub || 'Free agent',
    nationality: profile.nationality,
    goals: includeStatistics ? matches.reduce((sum, match) => sum + match.goals, 0) : null,
    assists: includeStatistics ? matches.reduce((sum, match) => sum + match.assists, 0) : null,
    matches: includeStatistics ? matches.length : null,
    endorsements: includeEndorsements ? recommendations.length : null,
    portfolioUrl: buildPublicPortfolioUrl(profile.id, username ?? profile.username),
    tagline: profile.biography.trim().slice(0, 120) || 'Football Passport on PitchProof',
    includeStatistics,
    includeEndorsements,
  };
}
