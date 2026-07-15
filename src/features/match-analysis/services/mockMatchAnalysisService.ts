import {
  emptyEstimatedStats,
  type MatchAnalysisReport,
  type MatchContextInput,
  type PlayerTargeting,
} from '@/features/match-analysis/types';

/**
 * Offline / Expo Go fallback so players can still exercise the flow.
 * Stats are plausible mock estimates — labeled as mock in methodology.
 */
export function buildMockMatchAnalysisReport(
  targeting: PlayerTargeting,
  match: MatchContextInput,
  durationSec: number,
): MatchAnalysisReport {
  const minutes = Math.min(90, Math.max(45, Math.round(durationSec / 60)));
  const jersey = targeting.jerseyNumber || '?';
  const passesAttempted = 28 + (Number(jersey) % 17);
  const passesCompleted = Math.round(passesAttempted * 0.78);
  const shots = 2 + (Number(jersey) % 3);
  const shotsOnTarget = Math.max(1, shots - 1);
  const duelsWon = 6 + (Number(jersey) % 5);
  const duelsLost = 3 + (Number(jersey) % 4);

  return {
    headline: `Solid film study of #${jersey} vs ${match.opponent || 'opponent'}`,
    strengths: [
      'Maintained shape when out of possession',
      'Looked to progress the ball into half-spaces',
      'Won several second balls around the box',
    ],
    improvements: [
      'Tighten first touch under pressure in the final third',
      'Delay pressing trigger by half a second when cover is late',
      'Choose earlier forward passes when lanes open',
    ],
    coachingNotes: `AI mock review focused on jersey #${jersey} (${targeting.kitPrimaryColor}/${targeting.kitSecondaryColor}). Connect OpenRouter vision for live frame analysis.`,
    estimatedStats: {
      ...emptyEstimatedStats(),
      minutesPlayed: minutes,
      goals: Number(jersey) % 3 === 0 ? 1 : 0,
      assists: Number(jersey) % 4 === 0 ? 1 : 0,
      shots,
      shotsOnTarget,
      passesAttempted,
      passesCompleted,
      passCompletionPct: Math.round((passesCompleted / passesAttempted) * 100),
      keyPasses: 1 + (Number(jersey) % 3),
      tackles: 2 + (Number(jersey) % 4),
      duelsWon,
      duelsLost,
      foulsCommitted: Number(jersey) % 5 === 0 ? 1 : 0,
      yellowCards: 0,
      redCards: 0,
      matchRating: 6.8 + ((Number(jersey) % 10) / 10),
      cleanSheet: false,
    },
    moments: [
      {
        timestampSec: Math.round(durationSec * 0.22),
        label: 'Progressive carry',
        detail: 'Drove into space after recovering a loose ball.',
      },
      {
        timestampSec: Math.round(durationSec * 0.61),
        label: 'Chance involvement',
        detail: 'Arrived late into the box supporting the attack.',
      },
    ],
    confidence: 0.42,
    methodology:
      'Mock analysis (no vision provider). Estimated stats are simulated for UX testing and labeled as such.',
    modelId: 'mock/match-footage-v1',
    generatedAt: new Date().toISOString(),
  };
}
