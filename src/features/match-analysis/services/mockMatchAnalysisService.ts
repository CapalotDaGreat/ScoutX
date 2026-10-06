import {
  emptyEstimatedStats,
  type MatchAnalysisReport,
  type MatchContextInput,
  type PlayerTargeting,
} from '@/features/match-analysis/types';
import {
  buildConservativePipelineStages,
  buildConservativeTacticalSummary,
} from '@/features/match-analysis/services/matchAnalysisPipelineService';

/**
 * Offline / Expo Go fallback so players can still exercise the flow.
 * Demo reports never invent countable stats or tracking stages.
 */
export function buildMockMatchAnalysisReport(
  targeting: PlayerTargeting,
  match: MatchContextInput,
  durationSec: number,
): MatchAnalysisReport {
  const jersey = targeting.jerseyNumber || '?';

  return {
    headline: `Demo review placeholder for #${jersey} vs ${match.opponent || 'opponent'}`,
    strengths: [],
    improvements: [],
    coachingNotes: '',
    estimatedStats: emptyEstimatedStats(),
    moments: [],
    coverage: {
      visiblePct: 0,
      likelyOffCameraPct: 0,
      unknownPct: 100,
      confidenceLabel: 'Insufficient',
      note: 'Demo mode does not inspect footage and does not estimate coverage.',
    },
    sampledCoverage: {
      sampledFrameCount: 0,
      identifiedFrameCount: 0,
      confidenceLabel: 'Insufficient',
    },
    pipelineStages: buildConservativePipelineStages(jersey),
    segments: [],
    availability: [],
    tacticalSummary: buildConservativeTacticalSummary(),
    evidence: [
      {
        id: 'demo_unknown',
        kind: 'unknown',
        label: 'Demo report',
        detail: `This demo is not based on the ${Math.round(durationSec / 60)} min recording for jersey #${jersey}. Countable stats stay unknown.`,
        confidence: 0,
        timestampSec: 0,
        source: 'mock',
      },
    ],
    events: [],
    coachingMoments: [],
    confidenceDimensions: {
      videoQuality: 'Insufficient',
      playerIdentity: 'Insufficient',
      cameraCoverage: 'Insufficient',
      trackingStability: 'Insufficient',
      eventConfidence: 'Insufficient',
      overallCoverage: 'Insufficient',
    },
    confidence: null,
    methodology:
      'DEMO REPORT — generated in development mock mode. It is not based on your footage and must not be used as real analysis.',
    modelId: 'mock/unavailable-cv-v1',
    generatedAt: new Date().toISOString(),
  };
}
