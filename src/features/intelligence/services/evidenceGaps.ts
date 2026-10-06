import type { FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import type { PlayerMatchStatistics } from '@/features/player-statistics/types';
import type { EvidenceGap } from '@/features/intelligence/types';

export const CLAIM_SUPPORT_REQUIRED = 3;

const POSITION_ALIASES: Record<string, string> = {
  gk: 'goalkeeper',
  cb: 'centre back',
  'center back': 'centre back',
  lb: 'left back',
  rb: 'right back',
  cdm: 'defensive midfielder',
  dm: 'defensive midfielder',
  cm: 'central midfielder',
  cam: 'attacking midfielder',
  am: 'attacking midfielder',
  lw: 'left winger',
  rw: 'right winger',
  st: 'striker',
  cf: 'centre forward',
  'center forward': 'centre forward',
};

export function normalizePosition(value: string): string {
  const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return POSITION_ALIASES[key] ?? key;
}

/** Which recorded match metric can support a stated playing style. */
const STYLE_SUPPORT: Record<string, 'passAccuracy' | 'tackles' | 'goalContributions' | null> = {
  'Possession-based': 'passAccuracy',
  Technical: 'passAccuracy',
  'High press': 'tackles',
  Direct: 'goalContributions',
  'Counter-attacking': 'goalContributions',
  'Wide play': null,
  Physical: null,
};

export type EvidenceGapInput = {
  identity: Pick<
    FootballIdentity,
    'preferredPositions' | 'preferredPlayingStyle' | 'weakFootRating' | 'skillMovesRating'
  >;
  matches: readonly PlayerMatchStatistics[];
  coachEndorsementCount: number;
};

function support(sample: number): EvidenceGap['support'] | null {
  if (sample >= CLAIM_SUPPORT_REQUIRED) return null;
  return sample === 0 ? 'none' : 'limited';
}

/**
 * Self-reported claims that recorded evidence does not (yet) back up. A gap is not an
 * accusation; it is the most direct way to make a Passport claim credible.
 */
export function findEvidenceGaps(input: EvidenceGapInput): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  const played = input.matches.filter((match) => match.minutes > 0);

  for (const position of input.identity.preferredPositions) {
    const target = normalizePosition(position);
    if (!target) continue;
    const sample = played.filter(
      (match) => match.position && normalizePosition(match.position) === target,
    ).length;
    const state = support(sample);
    if (state) {
      gaps.push({
        id: `position-${target}`,
        claimKind: 'position',
        claimValue: position,
        support: state,
        sampleSize: sample,
        required: CLAIM_SUPPORT_REQUIRED,
        actions: ['add_match', 'add_clip', 'edit_claim'],
      });
    }
  }

  const style = input.identity.preferredPlayingStyle.trim();
  if (style) {
    const metric = STYLE_SUPPORT[style];
    const sample =
      metric === 'passAccuracy'
        ? played.filter((match) => match.passAccuracy !== null).length
        : metric === 'tackles'
          ? played.filter((match) => match.tackles !== null).length
          : metric === 'goalContributions'
            ? played.length
            : 0;
    const state = metric === null ? 'self_reported_only' : support(sample);
    if (state) {
      gaps.push({
        id: 'style',
        claimKind: 'playing_style',
        claimValue: style,
        support: state,
        sampleSize: sample,
        required: CLAIM_SUPPORT_REQUIRED,
        actions:
          metric === 'passAccuracy' || metric === 'tackles'
            ? ['record_metric', 'add_clip', 'ask_coach', 'edit_claim']
            : ['add_clip', 'ask_coach', 'edit_claim'],
      });
    }
  }

  // Star self-ratings cannot be derived from logged matches; only a coach or video backs them.
  if (input.coachEndorsementCount === 0) {
    if (input.identity.weakFootRating !== null) {
      gaps.push({
        id: 'weak-foot',
        claimKind: 'weak_foot',
        claimValue: `${input.identity.weakFootRating}/5`,
        support: 'self_reported_only',
        sampleSize: 0,
        required: 1,
        actions: ['add_clip', 'ask_coach', 'edit_claim'],
      });
    }
    if (input.identity.skillMovesRating !== null) {
      gaps.push({
        id: 'skill-moves',
        claimKind: 'skill_moves',
        claimValue: `${input.identity.skillMovesRating}/5`,
        support: 'self_reported_only',
        sampleSize: 0,
        required: 1,
        actions: ['add_clip', 'ask_coach', 'edit_claim'],
      });
    }
  }

  return gaps;
}
