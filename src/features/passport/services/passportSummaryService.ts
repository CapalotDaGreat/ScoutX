import type { CoverageState } from '@/features/development/types';
import type { PlayerMatchStatistics } from '@/features/player-statistics/types';
import type { PlayerProfile } from '@/features/player-profile/types';
import type { TrustRecommendation } from '@/features/trust-system/types';
import type {
  CoverageDimensionId,
  DiscoverabilityHealth,
  EvidenceCoverage,
  PassportCoachTip,
  PassportSummary,
  ProofItem,
  ReadinessItem,
} from '@/features/passport/types';

const STRONG = 8;
const MODERATE = 4;

export function coverageState(sampleSize: number, strong = STRONG, moderate = MODERATE): CoverageState {
  if (sampleSize >= strong) return 'strong';
  if (sampleSize >= moderate) return 'moderate';
  if (sampleSize >= 1) return 'limited';
  return 'insufficient';
}

function newestDate(dates: string[]): string | null {
  const valid = dates.filter((value) => !Number.isNaN(Date.parse(value))).sort();
  return valid[valid.length - 1] ?? null;
}

function buildCoverage(
  matches: readonly PlayerMatchStatistics[],
  videoCount: number,
  gpsSessionCount: number,
): EvidenceCoverage[] {
  const withMinutes = matches.filter((match) => match.minutes > 0);
  const withPass = matches.filter((match) => typeof match.passAccuracy === 'number');
  const lastMatch = newestDate(matches.map((match) => match.date));
  // Physical evidence only comes from GPS sessions; minutes played say nothing about it.
  const dimensions: Array<{ id: CoverageDimensionId; sample: number; provenance: EvidenceCoverage['provenance'] }> = [
    { id: 'technical', sample: withMinutes.length, provenance: 'match_derived' },
    { id: 'tactical', sample: withPass.length, provenance: 'match_derived' },
    { id: 'physical', sample: gpsSessionCount, provenance: 'gps_derived' },
    { id: 'consistency', sample: matches.length, provenance: 'match_derived' },
    { id: 'video', sample: videoCount, provenance: 'self_reported' },
  ];
  return dimensions.map((item) => ({
    id: item.id,
    state: coverageState(item.sample),
    sampleSize: item.sample,
    requiredForStrong: item.id === 'video' || item.id === 'physical' ? 3 : STRONG,
    lastAt: item.id === 'video' || item.id === 'physical' ? null : lastMatch,
    provenance: item.provenance,
  }));
}

function buildReadiness(
  profile: PlayerProfile,
  matches: readonly PlayerMatchStatistics[],
  videoCount: number,
  endorsements: number,
  appOps: { pushRegistered: boolean; legalPagesReady: boolean },
): ReadinessItem[] {
  const items: ReadinessItem[] = [
    {
      id: 'matches',
      label: 'Match evidence',
      group: 'evidence',
      status: matches.length >= 3 ? 'ready' : matches.length > 0 ? 'partial' : 'missing',
      reason:
        matches.length >= 3
          ? `${matches.length} matches logged`
          : matches.length > 0
            ? `${matches.length} of 3 matches needed for a Before vs Now comparison`
            : 'No matches logged yet',
    },
    {
      id: 'video',
      label: 'Video evidence',
      group: 'evidence',
      status: videoCount > 0 ? 'ready' : 'missing',
      reason: videoCount > 0 ? `${videoCount} highlight videos on file` : 'No highlight video uploaded',
    },
    {
      id: 'position',
      label: 'Position',
      group: 'evidence',
      status: profile.identity.preferredPositions.length > 0 || profile.position.trim().length > 0 ? 'ready' : 'missing',
      reason:
        profile.identity.preferredPositions.length > 0 || profile.position.trim().length > 0
          ? 'Position recorded (self-reported)'
          : 'No position recorded',
    },
    {
      id: 'public',
      label: 'Public Football Passport',
      group: 'sharing',
      status: profile.privacy?.publicPortfolioEnabled ? 'ready' : 'missing',
      reason: profile.privacy?.publicPortfolioEnabled
        ? 'Passport is public'
        : 'Passport is private — scouts cannot open the public link',
    },
    {
      id: 'discoverable',
      label: 'Scout discovery',
      group: 'sharing',
      status: profile.privacy?.discoverableByScouts ? 'ready' : 'missing',
      reason: profile.privacy?.discoverableByScouts
        ? 'Opted in to discovery'
        : 'Not listed in scout discovery',
    },
    {
      id: 'endorsement',
      label: 'Coach endorsement',
      group: 'evidence',
      status: endorsements > 0 ? 'ready' : 'missing',
      reason: endorsements > 0 ? `${endorsements} coach endorsement(s) on file` : 'No coach endorsement yet',
    },
    {
      id: 'push',
      label: 'Device notifications',
      group: 'app_ops',
      status: appOps.pushRegistered ? 'ready' : 'missing',
      reason: appOps.pushRegistered
        ? 'This device can receive ScoutX notifications'
        : 'Notifications are an app setting, not part of football evidence',
    },
    {
      id: 'legal',
      label: 'Store listing pages',
      group: 'app_ops',
      status: appOps.legalPagesReady ? 'ready' : 'missing',
      reason: appOps.legalPagesReady
        ? 'Privacy policy and terms URLs are configured'
        : 'Missing legal URLs — this is an app-ops item, not a player gap',
    },
  ];
  return items;
}

function buildProof(
  matches: readonly PlayerMatchStatistics[],
  profile: PlayerProfile,
  endorsements: TrustRecommendation[],
): ProofItem[] {
  const items: ProofItem[] = [];
  const latestMatch = [...matches].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latestMatch) {
    items.push({
      id: `match-${latestMatch.id}`,
      title: `vs ${latestMatch.opponent}`,
      detail: `${latestMatch.minutes} min · ${latestMatch.goals} G · ${latestMatch.assists} A`,
      occurredAt: latestMatch.date,
      provenance: 'self_reported',
    });
  }
  const video = profile.highlightVideos?.videos[0];
  if (video) {
    items.push({
      id: `video-${video.id}`,
      title: video.title,
      detail: video.category,
      occurredAt: video.createdAt ?? null,
      provenance: 'self_reported',
    });
  }
  const endorsement = endorsements[0];
  if (endorsement) {
    items.push({
      id: `endorsement-${endorsement.id}`,
      title: endorsement.authorName,
      detail: endorsement.authorOrganization,
      occurredAt: endorsement.createdAt,
      provenance: 'coach_provided',
    });
  }
  const journey = profile.footballJourney?.entries[0];
  if (journey) {
    items.push({
      id: `journey-${journey.id}`,
      title: journey.title,
      detail: journey.organization ?? journey.subtitle ?? journey.date,
      occurredAt: journey.date,
      provenance: 'self_reported',
    });
  }
  return items;
}

function buildDiscoverability(
  profile: PlayerProfile,
  matches: readonly PlayerMatchStatistics[],
  videoCount: number,
): DiscoverabilityHealth {
  const publicPassport = Boolean(profile.privacy?.publicPortfolioEnabled);
  const discoverable = Boolean(profile.privacy?.discoverableByScouts);
  const blockers: string[] = [];
  if (!publicPassport) blockers.push('public_passport_off');
  if (!discoverable) blockers.push('discovery_opt_in_off');
  if (matches.length === 0) blockers.push('no_matches');
  return {
    discoverable,
    publicPassport,
    blockers,
    lastEvidenceAt: newestDate(matches.map((match) => match.date)),
    matchCount: matches.length,
    videoCount,
  };
}

function buildCoachTips(coverage: EvidenceCoverage[], readiness: ReadinessItem[]): PassportCoachTip[] {
  const tips: PassportCoachTip[] = [];
  for (const dimension of coverage) {
    if (dimension.state === 'insufficient' || dimension.state === 'limited') {
      tips.push({
        id: `cover-${dimension.id}`,
        title: dimension.id,
        reason: `${dimension.sampleSize} of ${dimension.requiredForStrong} samples`,
        dimension: dimension.id,
      });
    }
  }
  for (const item of readiness) {
    if (item.group !== 'app_ops' && item.status !== 'ready') {
      tips.push({
        id: `ready-${item.id}`,
        title: item.label,
        reason: item.reason,
        dimension: item.id === 'video' ? 'video' : item.id === 'matches' ? 'consistency' : 'sharing',
      });
    }
  }
  return tips.slice(0, 3);
}

export type PassportSummaryInput = {
  profile: PlayerProfile;
  recommendations?: TrustRecommendation[];
  pushRegistered?: boolean;
  legalPagesReady?: boolean;
  /** Recorded GPS sessions; the only source of physical evidence. */
  gpsSessionCount?: number;
  now?: Date;
};

/**
 * Builds a passport summary from recorded data only. App-ops items are labelled as such and
 * never mixed into evidence coverage. Percentages are not emitted without a sample size.
 */
export function buildPassportSummary(input: PassportSummaryInput): PassportSummary {
  const matches = input.profile.statisticsMatches ?? [];
  const videoCount = input.profile.highlightVideos?.videos.length ?? 0;
  const endorsements = input.recommendations ?? [];
  const coverage = buildCoverage(matches, videoCount, input.gpsSessionCount ?? 0);
  const readiness = buildReadiness(input.profile, matches, videoCount, endorsements.length, {
    pushRegistered: Boolean(input.pushRegistered),
    legalPagesReady: Boolean(input.legalPagesReady),
  });
  return {
    playerId: input.profile.id,
    computedAt: (input.now ?? new Date()).toISOString(),
    coverage,
    readiness,
    proof: buildProof(matches, input.profile, endorsements),
    discoverability: buildDiscoverability(input.profile, matches, videoCount),
    coachTips: buildCoachTips(coverage, readiness),
    lastEvidenceAt: newestDate(matches.map((match) => match.date)),
    matchCount: matches.length,
    videoCount,
    endorsementCount: endorsements.length,
  };
}
