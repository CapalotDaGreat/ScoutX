export type StatisticTrendDirection = 'up' | 'down' | 'neutral';

export type StatisticMetricKey =
  | 'goals'
  | 'assists'
  | 'minutes'
  | 'matches'
  | 'cleanSheets'
  | 'passAccuracy'
  | 'shots'
  | 'tackles';

export type StatisticMetricCategory = 'attacking' | 'availability' | 'defending' | 'possession';

export type StatisticMetricDefinition = {
  key: StatisticMetricKey;
  label: string;
  shortLabel: string;
  category: StatisticMetricCategory;
  unit?: string;
  higherIsBetter: boolean;
  maxRadarValue: number;
};

/**
 * The player's own post-match reflection, in their own words. This is self-reported,
 * never shown on the public Passport and never presented as a verified match event
 * or an AI observation.
 */
export type MatchReflection = {
  wentWell: string;
  difficult: string;
  /** One priority the player chose for the next training session. */
  nextPriority: string;
};

export function hasMatchReflection(
  reflection: MatchReflection | null | undefined,
): reflection is MatchReflection {
  return Boolean(
    reflection &&
      (reflection.wentWell.trim() || reflection.difficult.trim() || reflection.nextPriority.trim()),
  );
}

/** `null` means the player did not record the value — never substitute a default. */
export type PlayerMatchStatistics = {
  id: string;
  date: string;
  opponent: string;
  competition: string;
  result: string;
  position?: string;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  passAccuracy: number | null;
  /** null = not recorded for this match (never assume 0). */
  shots: number | null;
  tackles: number | null;
  yellowCards: number;
  redCards: number;
  matchRating: number | null;
  notes: string;
  /** Absent/null until the player writes a post-match reflection. */
  reflection?: MatchReflection | null;
};

export type MatchLogPayload = Omit<PlayerMatchStatistics, 'id'>;

export type StatisticTrend = {
  value: string;
  direction: StatisticTrendDirection;
  delta: number;
  /** True when there are too few matches to compare against. */
  baseline: boolean;
  formattedDelta: string;
};

export type StatisticSummaryItem = {
  key: StatisticMetricKey;
  label: string;
  value: number;
  formattedValue: string;
  average: number;
  formattedAverage: string;
  averageLabel: string;
  displaySubtitle: string;
  trend: StatisticTrend;
  /** Matches that recorded this metric; 0 means it was never tracked, not a zero value. */
  recordedCount: number;
};

export type RadarChartPoint = {
  key: StatisticMetricKey;
  label: string;
  value: number;
  normalizedValue: number;
};

export type ProgressGraphPoint = {
  matchId: string;
  label: string;
  value: number;
  formattedValue: string;
};

export type ProgressGraph = {
  key: StatisticMetricKey;
  label: string;
  points: ProgressGraphPoint[];
  trend: StatisticTrend;
};

export type MatchHistoryItem = {
  id: string;
  date: string;
  opponent: string;
  competition: string;
  result: string;
  summary: string;
  stats: Pick<
    PlayerMatchStatistics,
    | 'minutes'
    | 'goals'
    | 'assists'
    | 'passAccuracy'
    | 'shots'
    | 'tackles'
    | 'yellowCards'
    | 'redCards'
    | 'matchRating'
  > & {
    cleanSheet: boolean;
  };
  notes: string;
  reflection: MatchReflection | null;
};

export type PlayerStatisticsOverview = {
  totals: StatisticSummaryItem[];
  radar: RadarChartPoint[];
  progressGraphs: ProgressGraph[];
  matchHistory: MatchHistoryItem[];
  matchCount: number;
};
