import type { MatchLogPayload, PlayerMatchStatistics } from '@/features/player-statistics/types';

export type MatchResultOutcome = 'W' | 'D' | 'L';

export type MatchLogFormState = {
  date: string;
  opponent: string;
  competition: string;
  position: string;
  /** Free-text score/result such as "W 2-1". */
  result: string;
  minutes: string;
  goals: string;
  assists: string;
  cleanSheet: boolean;
  /** Empty string = not recorded. */
  passAccuracy: string;
  shots: string;
  tackles: string;
  yellowCards: string;
  redCards: string;
  /** Empty string = not recorded. */
  matchRating: string;
  notes: string;
};

export type MatchLogNumericField =
  | 'minutes'
  | 'goals'
  | 'assists'
  | 'shots'
  | 'tackles'
  | 'yellowCards'
  | 'redCards'
  | 'passAccuracy'
  | 'matchRating';

/** Machine-readable reason so the UI can translate it; `message` stays as an English fallback. */
export type MatchLogValidationError =
  | { code: 'opponent_required' | 'competition_required' | 'minutes_required' | 'date_invalid' | 'date_future' }
  | { code: 'not_a_number' | 'not_whole'; field: MatchLogNumericField }
  | { code: 'out_of_range'; field: MatchLogNumericField; min: number; max: number };

export type MatchLogValidationResult =
  | {
      valid: true;
      payload: MatchLogPayload;
    }
  | {
      valid: false;
      message: string;
      error: MatchLogValidationError;
    };

const FIELD_LABELS: Record<MatchLogNumericField, string> = {
  minutes: 'Minutes played',
  goals: 'Goals',
  assists: 'Assists',
  shots: 'Shots',
  tackles: 'Tackles',
  yellowCards: 'Yellow cards',
  redCards: 'Red cards',
  passAccuracy: 'Pass accuracy',
  matchRating: 'Match rating',
};

function fail(error: MatchLogValidationError): Extract<MatchLogValidationResult, { valid: false }> {
  switch (error.code) {
    case 'opponent_required':
      return { valid: false, error, message: 'Opponent is required.' };
    case 'competition_required':
      return { valid: false, error, message: 'Competition is required.' };
    case 'minutes_required':
      return { valid: false, error, message: 'Minutes played is required.' };
    case 'date_invalid':
      return { valid: false, error, message: 'Match date must look like 2026-07-02.' };
    case 'date_future':
      return { valid: false, error, message: 'Match date cannot be in the future.' };
    case 'not_a_number':
      return { valid: false, error, message: `${FIELD_LABELS[error.field]} must be a valid number.` };
    case 'not_whole':
      return { valid: false, error, message: `${FIELD_LABELS[error.field]} must be a whole number.` };
    case 'out_of_range':
      return {
        valid: false,
        error,
        message: `${FIELD_LABELS[error.field]} must be between ${error.min} and ${error.max}.`,
      };
  }
}

export function todayIsoDate(now: Date = new Date()): string {
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export const defaultMatchLogFormState: MatchLogFormState = {
  date: todayIsoDate(),
  opponent: '',
  competition: '',
  position: '',
  result: '',
  minutes: '',
  goals: '0',
  assists: '0',
  cleanSheet: false,
  passAccuracy: '',
  shots: '',
  tackles: '',
  yellowCards: '0',
  redCards: '0',
  matchRating: '',
  notes: '',
};

function sortByDateDesc(matches: PlayerMatchStatistics[]): PlayerMatchStatistics[] {
  return [...matches].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Smart defaults come only from the player's own history: last competition, last position
 * and last minutes. Nothing performance-related is pre-filled.
 */
export function buildQuickMatchDefaults(
  previousMatches: PlayerMatchStatistics[],
  profilePosition: string,
  now: Date = new Date(),
): MatchLogFormState {
  const [latest] = sortByDateDesc(previousMatches);
  return {
    ...defaultMatchLogFormState,
    date: todayIsoDate(now),
    competition: latest?.competition && latest.competition !== 'Match' ? latest.competition : '',
    position: latest?.position || profilePosition || '',
    minutes: latest && latest.minutes > 0 ? String(latest.minutes) : '',
  };
}

/** Distinct recent competitions, newest first, for one-tap selection. */
export function recentCompetitions(previousMatches: PlayerMatchStatistics[], limit = 3): string[] {
  const result: string[] = [];
  for (const match of sortByDateDesc(previousMatches)) {
    const name = match.competition.trim();
    if (name && name !== 'Match' && !result.some((item) => item.toLowerCase() === name.toLowerCase())) {
      result.push(name);
    }
    if (result.length >= limit) break;
  }
  return result;
}

/** Builds "W 2-1" style results from the outcome and optional score. */
export function formatMatchResult(outcome: MatchResultOutcome | null, score: string): string {
  const trimmedScore = score.trim();
  if (!outcome) {
    return trimmedScore;
  }
  return trimmedScore ? `${outcome} ${trimmedScore}` : outcome;
}

export function parseMatchResult(result: string): { outcome: MatchResultOutcome | null; score: string } {
  const match = /^\s*([WDL])\b\s*(.*)$/i.exec(result);
  if (!match) {
    return { outcome: null, score: result.trim() };
  }
  return { outcome: match[1].toUpperCase() as MatchResultOutcome, score: match[2].trim() };
}

function parseNumber(value: string, field: MatchLogNumericField): MatchLogValidationResult | number {
  const parsed = Number(value.trim().replace(',', '.'));
  if (!value.trim() || !Number.isFinite(parsed)) {
    return fail({ code: 'not_a_number', field });
  }

  return parsed;
}

function parseWholeNumber(value: string, field: MatchLogNumericField): MatchLogValidationResult | number {
  const parsed = parseNumber(value, field);
  if (typeof parsed !== 'number') {
    return parsed;
  }

  if (!Number.isInteger(parsed)) {
    return fail({ code: 'not_whole', field });
  }

  return parsed;
}

function validateRange(
  value: number,
  field: MatchLogNumericField,
  min: number,
  max: number,
): MatchLogValidationResult | number {
  if (value < min || value > max) {
    return fail({ code: 'out_of_range', field, min, max });
  }

  return value;
}

function parseWholeInRange(
  value: string,
  field: MatchLogNumericField,
  min: number,
  max: number,
): MatchLogValidationResult | number {
  const parsed = parseWholeNumber(value.trim() || '0', field);
  if (typeof parsed !== 'number') return parsed;
  return validateRange(parsed, field, min, max);
}

function parseOptionalInRange(
  value: string,
  field: MatchLogNumericField,
  min: number,
  max: number,
): MatchLogValidationResult | number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = parseNumber(value, field);
  if (typeof parsed !== 'number') return parsed;
  return validateRange(parsed, field, min, max);
}

function parseOptionalWholeInRange(
  value: string,
  field: MatchLogNumericField,
  min: number,
  max: number,
): MatchLogValidationResult | number | null {
  if (!value.trim()) {
    return null;
  }
  return parseWholeInRange(value, field, min, max);
}

function isFailure(
  value: MatchLogValidationResult | number | null,
): value is Extract<MatchLogValidationResult, { valid: false }> {
  return typeof value === 'object' && value !== null && value.valid === false;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateMatchLogForm(
  state: MatchLogFormState,
  now: Date = new Date(),
): MatchLogValidationResult {
  const opponent = state.opponent.trim();
  const competition = state.competition.trim();
  const date = state.date.trim() || todayIsoDate(now);

  if (!opponent) {
    return fail({ code: 'opponent_required' });
  }

  if (!competition) {
    return fail({ code: 'competition_required' });
  }

  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date))) {
    return fail({ code: 'date_invalid' });
  }

  if (date > shiftIsoDate(todayIsoDate(now), 1)) {
    return fail({ code: 'date_future' });
  }

  if (!state.minutes.trim()) {
    return fail({ code: 'minutes_required' });
  }

  const minutes = parseWholeInRange(state.minutes, 'minutes', 0, 130);
  if (isFailure(minutes)) return minutes;
  const goals = parseWholeInRange(state.goals, 'goals', 0, 30);
  if (isFailure(goals)) return goals;
  const assists = parseWholeInRange(state.assists, 'assists', 0, 30);
  if (isFailure(assists)) return assists;
  const shots = parseOptionalWholeInRange(state.shots, 'shots', 0, 60);
  if (isFailure(shots)) return shots;
  const tackles = parseOptionalWholeInRange(state.tackles, 'tackles', 0, 60);
  if (isFailure(tackles)) return tackles;
  const yellowCards = parseWholeInRange(state.yellowCards, 'yellowCards', 0, 2);
  if (isFailure(yellowCards)) return yellowCards;
  const redCards = parseWholeInRange(state.redCards, 'redCards', 0, 1);
  if (isFailure(redCards)) return redCards;
  const passAccuracy = parseOptionalInRange(state.passAccuracy, 'passAccuracy', 0, 100);
  if (isFailure(passAccuracy)) return passAccuracy;
  const matchRating = parseOptionalInRange(state.matchRating, 'matchRating', 1, 10);
  if (isFailure(matchRating)) return matchRating;

  const position = state.position.trim();

  return {
    valid: true,
    payload: {
      date,
      opponent,
      competition,
      result: state.result.trim() || 'N/A',
      ...(position ? { position } : {}),
      minutes: minutes as number,
      goals: goals as number,
      assists: assists as number,
      cleanSheet: state.cleanSheet,
      passAccuracy: passAccuracy as number | null,
      shots: shots as number | null,
      tackles: tackles as number | null,
      yellowCards: yellowCards as number,
      redCards: redCards as number,
      matchRating: matchRating as number | null,
      notes: state.notes.trim(),
    },
  };
}

/** True when the form differs from the given baseline in a way worth keeping as a draft. */
export function hasMeaningfulMatchInput(
  state: MatchLogFormState,
  baseline: MatchLogFormState,
): boolean {
  return (Object.keys(state) as Array<keyof MatchLogFormState>).some(
    (key) => key !== 'date' && state[key] !== baseline[key],
  );
}

export function parseMatchLogFormState(value: unknown): MatchLogFormState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const result = { ...defaultMatchLogFormState };
  for (const key of Object.keys(defaultMatchLogFormState) as Array<keyof MatchLogFormState>) {
    const field = record[key];
    if (key === 'cleanSheet') {
      if (typeof field !== 'boolean') return null;
      result.cleanSheet = field;
    } else {
      if (typeof field !== 'string') return null;
      result[key] = field;
    }
  }
  return result;
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
    ...(match.position ? { position: match.position } : {}),
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
