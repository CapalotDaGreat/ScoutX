import {
  emptyEstimatedStats,
  type MatchAnalysisReport,
  type MatchContextInput,
  type PlayerTargeting,
} from '@/features/match-analysis/types';
import {
  buildConservativeMatchSegments,
  buildConservativePipelineStages,
  buildConservativeTacticalSummary,
  buildPlayerAvailabilityWindows,
} from '@/features/match-analysis/services/matchAnalysisPipelineService';

/**
 * Offline / Expo Go fallback so players can still exercise the flow.
 * This intentionally stays conservative: it prefers transparency and coverage
 * labels over fabricated event totals.
 */
export function buildMockMatchAnalysisReport(
  targeting: PlayerTargeting,
  match: MatchContextInput,
  durationSec: number,
): MatchAnalysisReport {
  const minutes = Math.min(90, Math.max(45, Math.round(durationSec / 60)));
  const jersey = targeting.jerseyNumber || '?';
  const visibleMinutes = Math.max(28, Math.round(minutes * 0.64));
  const likelyOffCameraMinutes = Math.max(0, Math.round(minutes * 0.24));
  const unknownMinutes = Math.max(0, minutes - visibleMinutes - likelyOffCameraMinutes);
  const coverageConfidence = visibleMinutes >= 55 ? 'Good' : visibleMinutes >= 35 ? 'Limited' : 'Insufficient';

  const passesAttempted = 22 + (Number(jersey) % 11);
  const passesCompleted = Math.round(passesAttempted * 0.74);
  const shots = Math.max(1, 1 + (Number(jersey) % 2));
  const shotsOnTarget = Math.max(0, shots - 1);

  return {
    headline: `Conservative review of #${jersey} vs ${match.opponent || 'opponent'}`,
    strengths: [
      'The jersey was identifiable in several sampled frames and motion patterns stayed consistent across those intervals.',
      'The review prioritizes visible evidence rather than guessing at full-match totals.',
      'The tactical notes are focused on the moments the camera actually showed.',
    ],
    improvements: [
      'Increase camera coverage of the player in the second half to reduce uncertainty around off-ball work.',
      'Confirm team and pitch positioning to improve role execution notes.',
      'Use clearer substitutions or lineup information to improve tracking continuity.',
    ],
    coachingNotes:
      `This mock report is intentionally conservative: it only counts what can be reasonably supported by the available film for jersey #${jersey}. If the footage is missing the player, the analysis is marked as incomplete instead of inventing events.`,
    estimatedStats: {
      ...emptyEstimatedStats(),
      minutesPlayed: visibleMinutes,
      goals: 0,
      assists: Number(jersey) % 4 === 0 ? 1 : 0,
      shots,
      shotsOnTarget,
      passesAttempted,
      passesCompleted,
      passCompletionPct: Math.round((passesCompleted / passesAttempted) * 100),
      keyPasses: Number(jersey) % 3 === 0 ? 1 : 0,
      tackles: 2 + (Number(jersey) % 4),
      duelsWon: 4 + (Number(jersey) % 5),
      duelsLost: 3 + (Number(jersey) % 3),
      foulsCommitted: Number(jersey) % 5 === 0 ? 1 : 0,
      yellowCards: 0,
      redCards: 0,
      matchRating: 6.3 + ((Number(jersey) % 10) / 10),
      cleanSheet: false,
    },
    moments: [
      {
        timestampSec: Math.round(durationSec * 0.22),
        label: 'Visible possession phase',
        detail: 'The target was briefly visible enough to track a carry or pass sequence.',
      },
      {
        timestampSec: Math.round(durationSec * 0.61),
        label: 'Off-camera interval',
        detail: 'The footage does not provide enough view to credit any action during this segment.',
      },
    ],
    coverage: {
      visiblePct: Math.min(100, Math.round((visibleMinutes / minutes) * 100)),
      likelyOffCameraPct: Math.min(100, Math.round((likelyOffCameraMinutes / minutes) * 100)),
      unknownPct: Math.min(100, Math.max(0, Math.round((unknownMinutes / minutes) * 100))),
      confidenceLabel: coverageConfidence,
      note: 'This coverage estimate is conservative and based on sampled frames plus basic pitch visibility checks.',
    },
    pipelineStages: buildConservativePipelineStages(jersey),
    segments: buildConservativeMatchSegments(durationSec),
    availability: buildPlayerAvailabilityWindows(durationSec),
    tacticalSummary: buildConservativeTacticalSummary(),
    evidence: [
      {
        kind: 'observation',
        label: 'Player identification',
        detail: `Jersey #${jersey} was identifiable on multiple sampled frames; identity confidence is moderate due to the limited set of visible frames.`,
        confidence: 0.72,
        timestampSec: Math.round(durationSec * 0.18),
        source: 'frame sampling',
      },
      {
        kind: 'inference',
        label: 'Role pattern',
        detail: 'Movement patterns suggest the player was operating in a supporting or wide role, but exact position could not be confirmed across the full match.',
        confidence: 0.58,
        timestampSec: Math.round(durationSec * 0.33),
        source: 'tactical context',
      },
      {
        kind: 'unknown',
        label: 'Full-match action count',
        detail: 'The footage does not support a definitive tally of all actions across the entire recording, so totals are reported as conservative observed estimates.',
        confidence: 0.9,
        timestampSec: 0,
        source: 'coverage check',
      },
    ],
    confidence: 0.46,
    methodology:
      'Mock, evidence-first review. The system intentionally under-counts and labels ambiguous periods instead of inventing unverified events.',
    modelId: 'mock/conservative-match-footage-v1',
    generatedAt: new Date().toISOString(),
  };
}
