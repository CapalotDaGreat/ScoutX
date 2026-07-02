import {
  type MatchLogPayload,
  type PlayerMatchStatistics,
} from '@/features/player-statistics/types';

export type MatchLogFormState = {
  date: string;
  opponent: string;
  competition: string;
  result: string;
  minutes: string;
  goals: string;
  assists: string;
  cleanSheet: boolean;
  passAccuracy: string;
  shots: string;
  tackles: string;
  yellowCards: string;
  redCards: string;
  matchRating: string;
  notes: string;
};

export type MatchLogValidationResult =
  | {
      valid: true;
      payload: MatchLogPayload;
    }
  | {
      valid: false;
      message: string;
    };

const today = new Date().toISOString().slice(0, 10);

export const defaultMatchLogFormState: MatchLogFormState = {
  date: today,
  opponent: '',
  competition: '',
  result: '',
  minutes: '90',
  goals: '0',
  assists: '0',
  cleanSheet: false,
  passAccuracy: '85',
  shots: '0',
  tackles: '0',
  yellowCards: '0',
  redCards: '0',
  matchRating: '7',
  notes: '',
};

function parseNumber(value: string, field: string): MatchLogValidationResult | number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return {
      valid: false,
      message: `${field} must be a valid number.`,
    };
  }

  return parsed;
}

function parseWholeNumber(value: string, field: string): MatchLogValidationResult | number {
  const parsed = parseNumber(value, field);
  if (typeof parsed !== 'number') {
    return parsed;
  }

  if (!Number.isInteger(parsed)) {
    return {
      valid: false,
      message: `${field} must be a whole number.`,
    };
  }

  return parsed;
}

function validateRange(
  value: number,
  field: string,
  min: number,
  max: number,
): MatchLogValidationResult | number {
  if (value < min || value > max) {
    return {
      valid: false,
      message: `${field} must be between ${min} and ${max}.`,
    };
  }

  return value;
}

export function validateMatchLogForm(state: MatchLogFormState): MatchLogValidationResult {
  const opponent = state.opponent.trim();
  const competition = state.competition.trim();

  if (!opponent) {
    return { valid: false, message: 'Opponent is required.' };
  }

  if (!competition) {
    return { valid: false, message: 'Competition is required.' };
  }

  const minutes = parseWholeNumber(state.minutes, 'Minutes played');
  if (typeof minutes !== 'number') return minutes;
  const validMinutes = validateRange(minutes, 'Minutes played', 0, 130);
  if (typeof validMinutes !== 'number') return validMinutes;

  const goals = parseWholeNumber(state.goals, 'Goals');
  if (typeof goals !== 'number') return goals;
  const validGoals = validateRange(goals, 'Goals', 0, 30);
  if (typeof validGoals !== 'number') return validGoals;

  const assists = parseWholeNumber(state.assists, 'Assists');
  if (typeof assists !== 'number') return assists;
  const validAssists = validateRange(assists, 'Assists', 0, 30);
  if (typeof validAssists !== 'number') return validAssists;

  const passAccuracy = parseNumber(state.passAccuracy, 'Pass accuracy');
  if (typeof passAccuracy !== 'number') return passAccuracy;
  const validPassAccuracy = validateRange(passAccuracy, 'Pass accuracy', 0, 100);
  if (typeof validPassAccuracy !== 'number') return validPassAccuracy;

  const shots = parseWholeNumber(state.shots, 'Shots');
  if (typeof shots !== 'number') return shots;
  const validShots = validateRange(shots, 'Shots', 0, 60);
  if (typeof validShots !== 'number') return validShots;

  const tackles = parseWholeNumber(state.tackles, 'Tackles');
  if (typeof tackles !== 'number') return tackles;
  const validTackles = validateRange(tackles, 'Tackles', 0, 60);
  if (typeof validTackles !== 'number') return validTackles;

  const yellowCards = parseWholeNumber(state.yellowCards, 'Yellow cards');
  if (typeof yellowCards !== 'number') return yellowCards;
  const validYellowCards = validateRange(yellowCards, 'Yellow cards', 0, 2);
  if (typeof validYellowCards !== 'number') return validYellowCards;

  const redCards = parseWholeNumber(state.redCards, 'Red cards');
  if (typeof redCards !== 'number') return redCards;
  const validRedCards = validateRange(redCards, 'Red cards', 0, 1);
  if (typeof validRedCards !== 'number') return validRedCards;

  const matchRating = parseNumber(state.matchRating, 'Match rating');
  if (typeof matchRating !== 'number') return matchRating;
  const validMatchRating = validateRange(matchRating, 'Match rating', 0, 10);
  if (typeof validMatchRating !== 'number') return validMatchRating;

  return {
    valid: true,
    payload: {
      date: state.date.trim() || today,
      opponent,
      competition,
      result: state.result.trim() || 'N/A',
      minutes: validMinutes,
      goals: validGoals,
      assists: validAssists,
      cleanSheet: state.cleanSheet,
      passAccuracy: validPassAccuracy,
      shots: validShots,
      tackles: validTackles,
      yellowCards: validYellowCards,
      redCards: validRedCards,
      matchRating: validMatchRating,
      notes: state.notes.trim(),
    },
  };
}

export function createMatchStatistics(
  payload: MatchLogPayload,
  id: string,
): PlayerMatchStatistics {
  return {
    id,
    ...payload,
  };
}

export function serializeMatchStatistics(
  match: PlayerMatchStatistics,
): Record<string, unknown> {
  return {
    id: match.id,
    date: match.date,
    opponent: match.opponent,
    competition: match.competition,
    result: match.result,
    minutes: match.minutes,
    goals: match.goals,
    assists: match.assists,
    cleanSheet: match.cleanSheet,
    passAccuracy: match.passAccuracy,
    shots: match.shots,
    tackles: match.tackles,
    yellowCards: match.yellowCards,
    redCards: match.redCards,
    matchRating: match.matchRating,
    notes: match.notes,
  };
}
