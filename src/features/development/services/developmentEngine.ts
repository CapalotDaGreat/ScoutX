import type { PlayerMatchStatistics } from '@/features/player-statistics/types';
import type { PlayerProfile } from '@/features/player-profile/types';
import type {
  BeforeVsNowComparison,
  CoverageState,
  DevelopmentGoal,
  GoalMeasurement,
  GoalProgressSummary,
  GoalStatus,
  HowIPlay,
  IdentitySnapshot,
  MatchDerivedMetricKey,
  MetricDirection,
  PlayerDnaTrait,
} from '@/features/development/types';

export const METRIC_DIRECTION: Record<MatchDerivedMetricKey, MetricDirection> = {
  goals: 'higher_is_better',
  assists: 'higher_is_better',
  shots: 'higher_is_better',
  tackles: 'higher_is_better',
  passAccuracy: 'higher_is_better',
  matchRating: 'higher_is_better',
  minutes: 'higher_is_better',
};

/**
 * Reads a metric from one match. Returns null when the player did not record it
 * (optional metrics) so averages never include invented zeros.
 */
export function readMetric(match: PlayerMatchStatistics, key: MatchDerivedMetricKey): number | null {
  switch (key) {
    case 'goals':
      return match.goals;
    case 'assists':
      return match.assists;
    case 'shots':
      return match.shots;
    case 'tackles':
      return match.tackles;
    case 'minutes':
      return match.minutes;
    case 'passAccuracy':
      return match.passAccuracy;
    case 'matchRating':
      return match.matchRating;
  }
}

export type MetricAverage = {
  value: number;
  sampleSize: number;
  matchIds: string[];
  from: string;
  to: string;
};

/** Average of a metric across matches where it was recorded. Null when none recorded it. */
export function averageMetric(
  matches: readonly PlayerMatchStatistics[],
  key: MatchDerivedMetricKey,
): MetricAverage | null {
  const recorded = matches
    .map((match) => ({ match, value: readMetric(match, key) }))
    .filter((item): item is { match: PlayerMatchStatistics; value: number } => item.value !== null);
  if (recorded.length === 0) {
    return null;
  }
  const dates = recorded.map((item) => item.match.date).sort();
  return {
    value: recorded.reduce((sum, item) => sum + item.value, 0) / recorded.length,
    sampleSize: recorded.length,
    matchIds: recorded.map((item) => item.match.id),
    from: dates[0],
    to: dates[dates.length - 1],
  };
}

export function sortByDateAsc(matches: readonly PlayerMatchStatistics[]): PlayerMatchStatistics[] {
  return [...matches].sort((a, b) => a.date.localeCompare(b.date));
}

export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export const BEFORE_VS_NOW_MIN_SAMPLE = 3;

export const BEFORE_VS_NOW_METRICS: readonly MatchDerivedMetricKey[] = [
  'goals',
  'assists',
  'shots',
  'tackles',
  'passAccuracy',
  'matchRating',
  'minutes',
];

export function compareBeforeVsNow(
  matches: readonly PlayerMatchStatistics[],
  metricKey: MatchDerivedMetricKey,
  windowSize = BEFORE_VS_NOW_MIN_SAMPLE,
): BeforeVsNowComparison {
  const sorted = sortByDateAsc(matches);
  if (sorted.length < windowSize * 2) {
    return {
      metricKey,
      state: 'insufficient',
      reason: 'not_enough_matches',
      sampleSize: sorted.length,
      required: windowSize * 2,
    };
  }

  const nowWindow = sorted.slice(-windowSize);
  const beforeWindow = sorted.slice(-windowSize * 2, -windowSize);
  const before = averageMetric(beforeWindow, metricKey);
  const now = averageMetric(nowWindow, metricKey);

  if (!before || !now || before.sampleSize < windowSize || now.sampleSize < windowSize) {
    return {
      metricKey,
      state: 'insufficient',
      reason: 'metric_not_recorded',
      sampleSize: Math.min(before?.sampleSize ?? 0, now?.sampleSize ?? 0),
      required: windowSize,
    };
  }

  const delta = round(now.value - before.value, 2);
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const improved =
    direction === 'flat'
      ? null
      : METRIC_DIRECTION[metricKey] === 'higher_is_better'
        ? direction === 'up'
        : direction === 'down';

  return {
    metricKey,
    state: 'available',
    before: { value: round(before.value, 2), sampleSize: before.sampleSize, from: before.from, to: before.to },
    now: { value: round(now.value, 2), sampleSize: now.sampleSize, from: now.from, to: now.to },
    delta,
    direction,
    improved,
    provenance: 'match_derived',
  };
}

export function buildBeforeVsNow(matches: readonly PlayerMatchStatistics[]): BeforeVsNowComparison[] {
  return BEFORE_VS_NOW_METRICS.map((key) => compareBeforeVsNow(matches, key));
}

export const GOAL_MEASUREMENT_WINDOW = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function measureGoal(
  goal: DevelopmentGoal,
  matches: readonly PlayerMatchStatistics[],
  now: Date,
): GoalMeasurement | null {
  if (goal.metricKey === 'none') {
    return null;
  }
  const since = goal.createdAt.slice(0, 10);
  const eligible = sortByDateAsc(matches).filter((match) => match.date.slice(0, 10) >= since);
  const window = eligible.slice(-GOAL_MEASUREMENT_WINDOW);
  const average = averageMetric(window, goal.metricKey);
  if (!average) {
    return null;
  }
  return {
    value: average.value,
    sampleSize: average.sampleSize,
    evidenceIds: average.matchIds,
    measuredAt: now.toISOString(),
  };
}

export function measureBaseline(
  goal: Pick<DevelopmentGoal, 'metricKey' | 'createdAt'>,
  matches: readonly PlayerMatchStatistics[],
): GoalMeasurement | null {
  if (goal.metricKey === 'none') {
    return null;
  }
  const since = goal.createdAt.slice(0, 10);
  const earlier = sortByDateAsc(matches).filter((match) => match.date.slice(0, 10) < since);
  const window = earlier.slice(-GOAL_MEASUREMENT_WINDOW);
  const average = averageMetric(window, goal.metricKey);
  if (!average) {
    return null;
  }
  return {
    value: average.value,
    sampleSize: average.sampleSize,
    evidenceIds: average.matchIds,
    measuredAt: goal.createdAt,
  };
}

function meetsTarget(goal: DevelopmentGoal, current: number): boolean {
  if (goal.targetValue === null || goal.metricKey === 'none') {
    return false;
  }
  return METRIC_DIRECTION[goal.metricKey] === 'higher_is_better'
    ? current >= goal.targetValue
    : current <= goal.targetValue;
}

function isBetterThanBaseline(goal: DevelopmentGoal, current: number): boolean | null {
  if (!goal.baseline || goal.metricKey === 'none') {
    return null;
  }
  const direction = METRIC_DIRECTION[goal.metricKey];
  if (current === goal.baseline.value) {
    return false;
  }
  return direction === 'higher_is_better'
    ? current > goal.baseline.value
    : current < goal.baseline.value;
}

export function deriveGoalStatus(
  goal: DevelopmentGoal,
  current: GoalMeasurement | null,
  now: Date,
): GoalStatus {
  if (goal.status === 'achieved' || goal.achievedAt) {
    return 'achieved';
  }
  if (current && meetsTarget(goal, current.value)) {
    return 'achieved';
  }
  if (goal.timeframeEnd && Date.parse(goal.timeframeEnd) < now.getTime()) {
    return 'revisit';
  }
  if (goal.progress.length === 0 && !current) {
    return 'not_started';
  }
  if (current && isBetterThanBaseline(goal, current.value) === true) {
    return 'improving';
  }
  return 'active';
}

export function goalPercent(goal: DevelopmentGoal, current: GoalMeasurement | null): number | null {
  if (!goal.baseline || !current || goal.targetValue === null) {
    return null;
  }
  const span = goal.targetValue - goal.baseline.value;
  if (span === 0) {
    return null;
  }
  const raw = ((current.value - goal.baseline.value) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function summarizeGoal(
  goal: DevelopmentGoal,
  matches: readonly PlayerMatchStatistics[],
  now: Date,
): GoalProgressSummary {
  const current = measureGoal(goal, matches, now);
  const status = deriveGoalStatus(goal, current, now);
  const lastProgress = [...goal.progress].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const daysLeft = goal.timeframeEnd
    ? Math.ceil((Date.parse(goal.timeframeEnd) - now.getTime()) / DAY_MS)
    : null;
  return {
    goal,
    status,
    current,
    percent: goalPercent(goal, current),
    daysLeft: daysLeft !== null && Number.isFinite(daysLeft) ? daysLeft : null,
    lastProgressAt: lastProgress?.date ?? null,
  };
}

export const GOAL_STATUS_ORDER: Record<GoalStatus, number> = {
  revisit: 0,
  active: 1,
  improving: 2,
  not_started: 3,
  achieved: 4,
};

export function sortGoalSummaries(summaries: GoalProgressSummary[]): GoalProgressSummary[] {
  return [...summaries].sort(
    (a, b) =>
      GOAL_STATUS_ORDER[a.status] - GOAL_STATUS_ORDER[b.status] ||
      b.goal.updatedAt.localeCompare(a.goal.updatedAt),
  );
}

export const DNA_STRONG_SAMPLE = 8;
export const DNA_MODERATE_SAMPLE = 4;

export function coverageFromSample(sampleSize: number): CoverageState {
  if (sampleSize >= DNA_STRONG_SAMPLE) return 'strong';
  if (sampleSize >= DNA_MODERATE_SAMPLE) return 'moderate';
  if (sampleSize >= 1) return 'limited';
  return 'insufficient';
}

function perMatch(matches: readonly PlayerMatchStatistics[], pick: (m: PlayerMatchStatistics) => number): number | null {
  if (matches.length === 0) return null;
  return round(matches.reduce((sum, m) => sum + pick(m), 0) / matches.length, 2);
}

export function buildPlayerDna(matches: readonly PlayerMatchStatistics[]): PlayerDnaTrait[] {
  const played = matches.filter((m) => m.minutes > 0);
  const withPassAccuracy = matches.filter((m) => typeof m.passAccuracy === 'number');
  const withTackles = played.filter((m) => m.tackles !== null);
  return [
    {
      id: 'goal_threat',
      sampleSize: played.length,
      state: coverageFromSample(played.length),
      value: perMatch(played, (m) => m.goals),
      unit: 'per_match',
      provenance: 'match_derived',
    },
    {
      id: 'creator',
      sampleSize: played.length,
      state: coverageFromSample(played.length),
      value: perMatch(played, (m) => m.assists),
      unit: 'per_match',
      provenance: 'match_derived',
    },
    {
      id: 'ball_retention',
      sampleSize: withPassAccuracy.length,
      state: coverageFromSample(withPassAccuracy.length),
      value: perMatch(withPassAccuracy, (m) => m.passAccuracy ?? 0),
      unit: 'percent',
      provenance: 'match_derived',
    },
    {
      id: 'defensive_presence',
      sampleSize: withTackles.length,
      state: coverageFromSample(withTackles.length),
      value: perMatch(withTackles, (m) => m.tackles ?? 0),
      unit: 'per_match',
      provenance: 'match_derived',
    },
    {
      id: 'discipline',
      sampleSize: played.length,
      state: coverageFromSample(played.length),
      value: perMatch(played, (m) => m.yellowCards + m.redCards * 2),
      unit: 'per_match',
      provenance: 'match_derived',
    },
    {
      id: 'availability',
      sampleSize: matches.length,
      state: coverageFromSample(matches.length),
      value: perMatch(matches, (m) => m.minutes),
      unit: 'minutes',
      provenance: 'match_derived',
    },
  ];
}

function nonEmpty(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function buildHowIPlay(
  profile: Pick<PlayerProfile, 'position' | 'identity'>,
  matches: readonly PlayerMatchStatistics[],
): HowIPlay {
  const positions = [
    ...new Set(
      [profile.position, ...profile.identity.preferredPositions, ...profile.identity.secondaryPositions]
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
  return {
    selfReported: {
      style: nonEmpty(profile.identity.preferredPlayingStyle),
      positions,
      strongFoot: nonEmpty(profile.identity.strongFoot),
      captainExperience: profile.identity.hasCaptainExperience,
    },
    matchDerived: buildPlayerDna(matches),
    sampleSize: matches.length,
    latestMatchAt: latestRecordedDate(matches),
  };
}

function latestRecordedDate(matches: readonly PlayerMatchStatistics[]): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const match of matches) {
    const ms = Date.parse(match.date);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latest = match.date;
    }
  }
  return latest;
}

export function snapshotFromProfile(
  profile: Pick<PlayerProfile, 'id' | 'position' | 'club' | 'identity'>,
  now: Date,
): Omit<IdentitySnapshot, 'id'> {
  return {
    ownerId: profile.id,
    effectiveFrom: now.toISOString().slice(0, 10),
    position: nonEmpty(profile.position) ?? nonEmpty(profile.identity.preferredPositions[0]),
    secondaryPositions: profile.identity.secondaryPositions.filter((p) => p.trim().length > 0),
    club: nonEmpty(profile.club) ?? nonEmpty(profile.identity.currentClub),
    style: nonEmpty(profile.identity.preferredPlayingStyle),
    strongFoot: nonEmpty(profile.identity.strongFoot),
    source: 'self_reported',
    createdAt: now.toISOString(),
  };
}

export function identityChanged(
  latest: IdentitySnapshot | null,
  candidate: Omit<IdentitySnapshot, 'id'>,
): boolean {
  if (!latest) {
    return true;
  }
  return (
    latest.position !== candidate.position ||
    latest.club !== candidate.club ||
    latest.style !== candidate.style ||
    latest.strongFoot !== candidate.strongFoot ||
    latest.secondaryPositions.join('|') !== candidate.secondaryPositions.join('|')
  );
}

export function sortSnapshotsNewestFirst(snapshots: readonly IdentitySnapshot[]): IdentitySnapshot[] {
  return [...snapshots].sort(
    (a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt),
  );
}
