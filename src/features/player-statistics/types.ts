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
};

export type MatchLogPayload = Omit<PlayerMatchStatistics, 'id'>;

export type StatisticTrend = {
  value: string;
  direction: StatisticTrendDirection;
  delta: number;
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
};

export type PlayerStatisticsOverview = {
  totals: StatisticSummaryItem[];
  radar: RadarChartPoint[];
  progressGraphs: ProgressGraph[];
  matchHistory: MatchHistoryItem[];
  matchCount: number;
};
