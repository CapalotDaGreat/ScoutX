import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { buildPublicPortfolioUrl } from '@/features/public-portfolio/constants';

export type PassportShareCardData = {
  playerName: string;
  position: string;
  club: string;
  nationality: string;
  goals: number;
  assists: number;
  matches: number;
  endorsements: number;
  portfolioUrl: string;
  tagline: string;
};

export function buildPassportShareCardData(
  data: PublicPortfolioData,
  username?: string | null,
): PassportShareCardData {
  const { profile, recommendations } = data;
  const matches = profile.statisticsMatches ?? [];

  return {
    playerName: profile.fullName,
    position: profile.position,
    club: profile.club || profile.identity.currentClub || 'Free agent',
    nationality: profile.nationality,
    goals: matches.reduce((sum, match) => sum + match.goals, 0),
    assists: matches.reduce((sum, match) => sum + match.assists, 0),
    matches: matches.length,
    endorsements: recommendations.length,
    portfolioUrl: buildPublicPortfolioUrl(profile.id, username ?? profile.username),
    tagline: profile.biography.trim().slice(0, 120) || 'Football Passport on PitchProof',
  };
}
