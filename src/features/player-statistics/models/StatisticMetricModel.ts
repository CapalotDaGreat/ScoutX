import {
  type PlayerMatchStatistics,
  type StatisticMetricDefinition,
  type StatisticMetricKey,
} from '@/features/player-statistics/types';

export const statisticMetricDefinitions: Record<StatisticMetricKey, StatisticMetricDefinition> = {
  goals: {
    key: 'goals',
    label: 'Goals',
    shortLabel: 'G',
    category: 'attacking',
    higherIsBetter: true,
    maxRadarValue: 20,
  },
  assists: {
    key: 'assists',
    label: 'Assists',
    shortLabel: 'A',
    category: 'attacking',
    higherIsBetter: true,
    maxRadarValue: 16,
  },
  minutes: {
    key: 'minutes',
    label: 'Minutes',
    shortLabel: 'Min',
    category: 'availability',
    higherIsBetter: true,
    maxRadarValue: 900,
  },
  matches: {
    key: 'matches',
    label: 'Matches',
    shortLabel: 'M',
    category: 'availability',
    higherIsBetter: true,
    maxRadarValue: 10,
  },
  cleanSheets: {
    key: 'cleanSheets',
    label: 'Clean Sheets',
    shortLabel: 'CS',
    category: 'defending',
    higherIsBetter: true,
    maxRadarValue: 8,
  },
  passAccuracy: {
    key: 'passAccuracy',
    label: 'Pass Accuracy',
    shortLabel: 'Pass',
    category: 'possession',
    unit: '%',
    higherIsBetter: true,
    maxRadarValue: 100,
  },
  shots: {
    key: 'shots',
    label: 'Shots',
    shortLabel: 'Sh',
    category: 'attacking',
    higherIsBetter: true,
    maxRadarValue: 35,
  },
  tackles: {
    key: 'tackles',
    label: 'Tackles',
    shortLabel: 'Tk',
    category: 'defending',
    higherIsBetter: true,
    maxRadarValue: 40,
  },
};

export const statisticMetricKeys: StatisticMetricKey[] = [
  'goals',
  'assists',
  'minutes',
  'matches',
  'cleanSheets',
  'passAccuracy',
  'shots',
  'tackles',
];

export function getMatchMetricValue(
  match: PlayerMatchStatistics,
  key: StatisticMetricKey,
): number {
  switch (key) {
    case 'goals':
      return match.goals;
    case 'assists':
      return match.assists;
    case 'minutes':
      return match.minutes;
    case 'matches':
      return match.minutes > 0 ? 1 : 0;
    case 'cleanSheets':
      return match.cleanSheet ? 1 : 0;
    case 'passAccuracy':
      return match.passAccuracy;
    case 'shots':
      return match.shots;
    case 'tackles':
      return match.tackles;
  }
}

export function formatStatisticValue(key: StatisticMetricKey, value: number): string {
  if (key === 'passAccuracy') {
    return `${Math.round(value)}%`;
  }

  if (key === 'minutes') {
    return Math.round(value).toLocaleString();
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
