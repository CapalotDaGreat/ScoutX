import type { DiscoverablePlayer, PlayerPosition } from '@/features/scout-discovery/types';
import type { WhyThisPlayerReason } from '@/features/scout-intelligence/types';

const RECENT_EVIDENCE_DAYS = 30;
const MIN_SAMPLE = 3;

export type WhyThisPlayerQuery = {
  positions?: PlayerPosition[];
  styleTags?: string[];
  nowMs?: number;
};

function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) {
    return null;
  }
  return (nowMs - at) / (1000 * 60 * 60 * 24);
}

/**
 * Deterministic "why this player" reasons. Every reason cites a recorded field;
 * missing ratings, potential, or invented chemistry are never used.
 */
export function explainWhyThisPlayer(
  player: DiscoverablePlayer,
  query: WhyThisPlayerQuery = {},
): WhyThisPlayerReason[] {
  const nowMs = query.nowMs ?? Date.now();
  const reasons: WhyThisPlayerReason[] = [];
  const wantedPositions = query.positions ?? [];
  const sharedPositions = wantedPositions.filter((position) => player.position.includes(position));

  if (sharedPositions.length > 0) {
    reasons.push({
      id: 'position',
      code: 'position',
      evidenceIds: [],
      sampleSize: sharedPositions.length,
      freshnessAt: player.lastEvidenceAt,
    });
  }

  const freshnessDays = daysSince(player.lastEvidenceAt, nowMs);
  if (freshnessDays !== null && freshnessDays <= RECENT_EVIDENCE_DAYS) {
    reasons.push({
      id: 'recent_evidence',
      code: 'recent_evidence',
      evidenceIds: [],
      sampleSize: player.matchCount,
      freshnessAt: player.lastEvidenceAt,
    });
  }

  if (player.matchCount >= MIN_SAMPLE) {
    reasons.push({
      id: 'sample_size',
      code: 'sample_size',
      evidenceIds: [],
      sampleSize: player.matchCount,
      freshnessAt: player.lastEvidenceAt,
    });
  }

  if (player.hasHighlightVideos) {
    reasons.push({
      id: 'video',
      code: 'video',
      evidenceIds: [],
      sampleSize: player.metrics.videoCount.sampleSize,
      freshnessAt: player.lastEvidenceAt,
    });
  }

  if (player.verified || player.verificationLevel === 'verified') {
    reasons.push({
      id: 'verified',
      code: 'verified',
      evidenceIds: [],
      sampleSize: 1,
      freshnessAt: null,
    });
  }

  const coverageHits = Object.entries(player.evidenceCoverage).filter(
    ([, state]) => state === 'strong' || state === 'moderate',
  );
  if (coverageHits.length > 0) {
    reasons.push({
      id: 'coverage',
      code: 'coverage',
      evidenceIds: [],
      sampleSize: coverageHits.length,
      freshnessAt: player.lastEvidenceAt,
    });
  }

  const wantedTags = (query.styleTags ?? []).map((tag) => tag.toLowerCase());
  const sharedTags = player.styleTags.filter((tag) => wantedTags.includes(tag.toLowerCase()));
  if (sharedTags.length > 0) {
    reasons.push({
      id: 'style',
      code: 'style',
      evidenceIds: [],
      sampleSize: sharedTags.length,
      freshnessAt: player.lastEvidenceAt,
    });
  }

  return reasons;
}
