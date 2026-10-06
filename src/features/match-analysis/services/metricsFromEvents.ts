import type { MatchAnalysisEvent, MatchEstimatedStats } from '@/features/match-analysis/types';

function emptyStats(): MatchEstimatedStats {
  return {
    minutesPlayed: null,
    goals: null,
    assists: null,
    shots: null,
    shotsOnTarget: null,
    passesAttempted: null,
    passesCompleted: null,
    passCompletionPct: null,
    keyPasses: null,
    tackles: null,
    duelsWon: null,
    duelsLost: null,
    foulsCommitted: null,
    yellowCards: null,
    redCards: null,
    matchRating: null,
    cleanSheet: null,
  };
}

function countAccepted(events: MatchAnalysisEvent[], type: MatchAnalysisEvent['type']): number {
  return events.filter((event) => event.validationStatus === 'accepted' && event.type === type).length;
}

/**
 * Deterministic stats from validated events only. If a category has no accepted events,
 * the value stays null — never 0 — because event detection may be unavailable.
 */
export function metricsFromEvents(events: MatchAnalysisEvent[]): MatchEstimatedStats {
  const accepted = events.filter((event) => event.validationStatus === 'accepted');
  if (accepted.length === 0) {
    return emptyStats();
  }

  const stats = emptyStats();
  const goals = countAccepted(accepted, 'goal');
  const assists = countAccepted(accepted, 'assist');
  const shots = countAccepted(accepted, 'shot') + goals;
  const passes = countAccepted(accepted, 'pass') + countAccepted(accepted, 'key_pass');
  const keyPasses = countAccepted(accepted, 'key_pass');
  const tackles = countAccepted(accepted, 'tackle');
  const duels = countAccepted(accepted, 'duel');
  const fouls = countAccepted(accepted, 'foul');
  const cards = countAccepted(accepted, 'card');

  return {
    ...stats,
    goals: goals > 0 ? goals : null,
    assists: assists > 0 ? assists : null,
    shots: shots > 0 ? shots : null,
    shotsOnTarget: goals > 0 ? goals : null,
    passesAttempted: passes > 0 ? passes : null,
    passesCompleted: passes > 0 ? passes : null,
    passCompletionPct: null,
    keyPasses: keyPasses > 0 ? keyPasses : null,
    tackles: tackles > 0 ? tackles : null,
    duelsWon: duels > 0 ? duels : null,
    duelsLost: null,
    foulsCommitted: fouls > 0 ? fouls : null,
    yellowCards: cards > 0 ? cards : null,
    redCards: null,
    minutesPlayed: null,
    matchRating: null,
    cleanSheet: null,
  };
}
