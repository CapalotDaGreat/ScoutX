import type { DiscoverablePlayer } from '@/features/scout-discovery/types';
import type { ScoutBrief, ScoutRecommendation } from '@/features/scout-intelligence/types';
import { explainWhyThisPlayer, type WhyThisPlayerQuery } from './whyThisPlayer';

function recommendationFor(player: DiscoverablePlayer, reasonCount: number): ScoutRecommendation {
  if (player.matchCount === 0 && !player.hasHighlightVideos) {
    return 'insufficient_evidence';
  }
  if (reasonCount === 0) {
    return 'insufficient_evidence';
  }
  return 'monitor';
}

/**
 * A scout brief is a deterministic summary of recorded evidence. It never invents
 * a sign/pass recommendation from ratings or potential.
 */
export function buildScoutBrief(
  scoutId: string,
  player: DiscoverablePlayer,
  query: WhyThisPlayerQuery = {},
  nowIso = new Date().toISOString(),
): ScoutBrief {
  const reasons = explainWhyThisPlayer(player, query);
  const evidencePoints = reasons.map((reason) => reason.code);
  const gaps: string[] = [];
  if (player.matchCount === 0) {
    gaps.push('no_matches');
  }
  if (!player.hasHighlightVideos) {
    gaps.push('no_video');
  }
  if (player.evidenceCoverage.technical === 'insufficient') {
    gaps.push('technical');
  }
  if (player.evidenceCoverage.tactical === 'insufficient') {
    gaps.push('tactical');
  }
  if (player.age === null) {
    gaps.push('age_unknown');
  }

  const knownBits = [
    player.fullName,
    player.primaryPosition ?? (player.position[0] ?? null),
    player.club !== 'Free Agent' ? player.club : null,
  ].filter((bit): bit is string => Boolean(bit));

  return {
    id: `brief-${scoutId}-${player.id}`,
    scoutId,
    playerId: player.id,
    headline: knownBits.join(' · '),
    evidencePoints,
    gaps,
    recommendation: recommendationFor(player, reasons.length),
    evidenceIds: reasons.flatMap((reason) => reason.evidenceIds),
    createdAt: nowIso,
  };
}
