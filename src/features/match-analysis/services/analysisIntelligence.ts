import type {
  AnalysisConfidenceBand,
  AnalysisConfidenceDimensions,
  CoachingMoment,
  EvidenceKind,
  IdentityConfirmation,
  MatchAnalysisEvent,
  MatchAnalysisReport,
  MatchEventType,
  MatchEstimatedStats,
  MatchVideoSync,
} from '@/features/match-analysis/types';

export type QualityDimensionKey = Exclude<keyof AnalysisConfidenceDimensions, 'overallCoverage'>;

export type QualityCanTell =
  | { code: 'accepted_events'; count: number }
  | { code: 'identity_confirmed' }
  | { code: 'visible_share'; pct: number }
  | { code: 'counted_stats'; count: number };

export type QualityUncertain =
  | { code: 'off_camera'; pct: number }
  | { code: 'rejected_events'; count: number }
  | { code: 'identity_unconfirmed' }
  | { code: 'cv_unavailable'; count: number }
  | { code: 'weak_dimension'; dimension: QualityDimensionKey }
  | { code: 'uncounted_stats'; count: number };

export type QualityReport = {
  overall: AnalysisConfidenceBand;
  dimensions: Array<{ key: QualityDimensionKey; band: AnalysisConfidenceBand | null }>;
  coverage: { visiblePct: number; likelyOffCameraPct: number; unknownPct: number };
  canTell: QualityCanTell[];
  uncertain: QualityUncertain[];
};

const DIMENSIONS: readonly QualityDimensionKey[] = [
  'videoQuality',
  'playerIdentity',
  'cameraCoverage',
  'trackingStability',
  'eventConfidence',
];

const WEAK: ReadonlySet<AnalysisConfidenceBand> = new Set(['Limited', 'Insufficient']);

/** Counted stats exclude derived ones so the player sees what was actually observed. */
const COUNTABLE: ReadonlyArray<keyof MatchEstimatedStats> = [
  'minutesPlayed',
  'goals',
  'assists',
  'shots',
  'passesAttempted',
  'tackles',
  'duelsWon',
];

/**
 * What this analysis can and cannot tell, from stored fields only. Missing confidence
 * dimensions stay null; unavailable computer-vision stages are listed as uncertainty.
 */
export function buildQualityReport(
  report: MatchAnalysisReport,
  context: { identityConfirmation?: IdentityConfirmation; events?: readonly MatchAnalysisEvent[] } = {},
): QualityReport {
  const dims = report.confidenceDimensions;
  const events = context.events ?? report.events ?? [];
  const accepted = events.filter((event) => event.validationStatus === 'accepted').length;
  const rejected = events.filter((event) => event.validationStatus === 'rejected').length;
  const counted = COUNTABLE.filter((key) => report.estimatedStats[key] !== null).length;
  const cvUnavailable = report.pipelineStages.filter((stage) => stage.status === 'unavailable').length;
  const identityConfirmed = context.identityConfirmation?.state === 'confirmed';
  const offCamera = Math.round(report.coverage.likelyOffCameraPct + report.coverage.unknownPct);

  const canTell: QualityCanTell[] = [];
  if (accepted > 0) canTell.push({ code: 'accepted_events', count: accepted });
  if (identityConfirmed) canTell.push({ code: 'identity_confirmed' });
  if (report.coverage.visiblePct > 0) canTell.push({ code: 'visible_share', pct: Math.round(report.coverage.visiblePct) });
  if (counted > 0) canTell.push({ code: 'counted_stats', count: counted });

  const uncertain: QualityUncertain[] = [];
  if (offCamera > 0) uncertain.push({ code: 'off_camera', pct: offCamera });
  if (rejected > 0) uncertain.push({ code: 'rejected_events', count: rejected });
  if (!identityConfirmed) uncertain.push({ code: 'identity_unconfirmed' });
  if (cvUnavailable > 0) uncertain.push({ code: 'cv_unavailable', count: cvUnavailable });
  for (const key of DIMENSIONS) {
    const band = dims?.[key];
    if (band && WEAK.has(band)) uncertain.push({ code: 'weak_dimension', dimension: key });
  }
  if (counted < COUNTABLE.length) uncertain.push({ code: 'uncounted_stats', count: COUNTABLE.length - counted });

  return {
    overall: dims?.overallCoverage ?? report.coverage.confidenceLabel,
    dimensions: DIMENSIONS.map((key) => ({ key, band: dims?.[key] ?? null })),
    coverage: {
      visiblePct: Math.round(report.coverage.visiblePct),
      likelyOffCameraPct: Math.round(report.coverage.likelyOffCameraPct),
      unknownPct: Math.round(report.coverage.unknownPct),
    },
    canTell,
    uncertain,
  };
}

export type CoachingGoalLike = { id: string; title: string; metricKey: string; status: string };

export type StructuredCoaching = {
  id: string;
  whatHappened: string;
  /** The goal this moment works towards; null when no active goal tracks the same skill. */
  whyItMatters: { goalId: string; goalTitle: string } | null;
  whatToImprove: string;
  howToTrain: string | null;
  howToMeasure: string | null;
  evidence: { timestampSec: number | null; eventTypes: MatchEventType[]; kind: EvidenceKind };
  confidence: AnalysisConfidenceBand;
  suggestedMetric: string | null;
};

const EVENT_METRIC: Partial<Record<MatchEventType, string>> = {
  shot: 'shots',
  goal: 'goals',
  assist: 'assists',
  pass: 'passAccuracy',
  key_pass: 'passAccuracy',
  tackle: 'tackles',
  duel: 'tackles',
};

/**
 * Coaching moments in a fixed structure. Every field comes from the stored moment; when a
 * field was not produced it stays null rather than being filled with generic advice.
 */
export function buildStructuredCoaching(
  moments: readonly CoachingMoment[],
  events: readonly MatchAnalysisEvent[],
  goals: readonly CoachingGoalLike[],
): StructuredCoaching[] {
  const eventsById = new Map(events.map((event) => [event.eventId, event]));
  const openGoals = goals.filter((goal) => goal.status !== 'achieved');
  return moments
    .filter((moment) => moment.coachingPoint.trim().length > 0)
    .map((moment) => {
      const eventTypes = moment.eventIds
        .map((id) => eventsById.get(id))
        .filter((event): event is MatchAnalysisEvent => event !== undefined && event.validationStatus === 'accepted')
        .map((event) => event.type);
      const metrics = [...new Set(eventTypes.map((type) => EVENT_METRIC[type]).filter((key): key is string => Boolean(key)))];
      const goal = openGoals.find((item) => metrics.includes(item.metricKey));
      return {
        id: moment.id,
        whatHappened: moment.context,
        whyItMatters: goal ? { goalId: goal.id, goalTitle: goal.title } : null,
        whatToImprove: moment.coachingPoint,
        howToTrain: moment.practiceIdea?.trim() || null,
        howToMeasure: moment.measurement?.trim() || null,
        evidence: { timestampSec: moment.timestampSec, eventTypes, kind: moment.observationKind },
        confidence: moment.confidenceLabel,
        suggestedMetric: metrics[0] ?? null,
      };
    });
}

export type VideoSync = MatchVideoSync;

export function parseVideoSync(value: unknown): VideoSync | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.gpsSessionId !== 'string' ||
    typeof row.gpsAnchorMs !== 'number' ||
    typeof row.videoAnchorSec !== 'number' ||
    !Number.isFinite(row.gpsAnchorMs) ||
    !Number.isFinite(row.videoAnchorSec) ||
    row.videoAnchorSec < 0
  ) {
    return null;
  }
  return {
    gpsSessionId: row.gpsSessionId,
    gpsAnchorMs: row.gpsAnchorMs,
    videoAnchorSec: row.videoAnchorSec,
    setAt: typeof row.setAt === 'string' ? row.setAt : '',
  };
}

/** Video second for a GPS timestamp, or null when it falls outside the footage. */
export function videoSecondForGps(timestampMs: number, sync: VideoSync, videoDurationSec: number): number | null {
  const second = sync.videoAnchorSec + (timestampMs - sync.gpsAnchorMs) / 1000;
  if (!Number.isFinite(second) || second < 0 || (videoDurationSec > 0 && second > videoDurationSec)) return null;
  return Math.round(second);
}
