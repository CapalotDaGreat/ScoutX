import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { buildPublicPortfolioUrl } from '@/features/public-portfolio/constants';
import { filterPortfolioForPublicExport, isPortfolioSectionVisible } from '@/features/public-portfolio/models/PortfolioModel';

/** Owner can only further restrict fields already allowed by Passport privacy. */
export type PassportShareCardOptions = {
  includeStatistics?: boolean;
  includeEndorsements?: boolean;
  includeTagline?: boolean;
  includePhoto?: boolean;
};

export type PassportShareCardData = {
  playerName: string;
  position: string;
  club: string;
  nationality: string;
  photoUrl: string | null;
  /** Null when statistics are hidden or unavailable — never invent zero. */
  goals: number | null;
  assists: number | null;
  matches: number | null;
  endorsements: number | null;
  portfolioUrl: string;
  tagline: string;
  includeStatistics: boolean;
  includeEndorsements: boolean;
  includePhoto: boolean;
  /** One-line preview of what will be exported (for confirmation UI). */
  exportPreview: string;
};

export function buildPassportShareCardData(
  data: PublicPortfolioData,
  username?: string | null,
  options: PassportShareCardOptions = {},
): PassportShareCardData | null {
  const filtered = filterPortfolioForPublicExport(data);
  if (!filtered) {
    return null;
  }
  const { profile, recommendations, privacy } = filtered;
  const allowStatistics = isPortfolioSectionVisible(privacy, 'statistics');
  const allowEndorsements = isPortfolioSectionVisible(privacy, 'recommendations');
  const includeStatistics = allowStatistics && options.includeStatistics !== false;
  const includeEndorsements = allowEndorsements && options.includeEndorsements !== false;
  const includeTagline = options.includeTagline !== false;
  const includePhoto = options.includePhoto !== false;
  const matches = includeStatistics ? (profile.statisticsMatches ?? []) : [];
  const photoUrl = includePhoto ? profile.avatarUrl || profile.coverImageUrl || null : null;
  const tagline = includeTagline
    ? profile.biography.trim().slice(0, 120) || 'Football Passport on PitchProof'
    : 'Football Passport on PitchProof';

  const goals = includeStatistics ? matches.reduce((sum, match) => sum + match.goals, 0) : null;
  const assists = includeStatistics ? matches.reduce((sum, match) => sum + match.assists, 0) : null;
  const matchCount = includeStatistics ? matches.length : null;
  const endorsementCount = includeEndorsements ? recommendations.length : null;

  const previewParts = [
    profile.fullName,
    profile.position,
    includeStatistics && matchCount !== null ? `${matchCount} matches` : null,
    includeStatistics && goals !== null ? `${goals} goals` : null,
    includeEndorsements && endorsementCount !== null ? `${endorsementCount} endorsements` : null,
    includePhoto && photoUrl ? 'photo' : null,
  ].filter(Boolean);

  return {
    playerName: profile.fullName,
    position: profile.position,
    club: profile.club || profile.identity.currentClub || 'Free agent',
    nationality: profile.nationality,
    photoUrl,
    goals,
    assists,
    matches: matchCount,
    endorsements: endorsementCount,
    portfolioUrl: buildPublicPortfolioUrl(profile.id, username ?? profile.username),
    tagline,
    includeStatistics,
    includeEndorsements,
    includePhoto: Boolean(photoUrl),
    exportPreview: previewParts.join(' · '),
  };
}
