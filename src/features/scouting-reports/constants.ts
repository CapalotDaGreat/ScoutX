export const SCOUTING_REPORTS_STORAGE_KEY = '@scoutx/scouting-reports/v1';

export const SCOUTING_REPORT_COLLECTION = 'scoutingReports';

export const RATING_MIN = 1;
export const RATING_MAX = 99;

export const ABILITY_RATING_FIELDS = [
  { key: 'technicalAbility' as const, label: 'Technical Ability' },
  { key: 'tacticalIntelligence' as const, label: 'Tactical Intelligence' },
  { key: 'physicalAbility' as const, label: 'Physical Ability' },
  { key: 'mentality' as const, label: 'Mentality' },
];

export const FORMATION_OPTIONS = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '3-5-2',
  '3-4-3',
  '4-1-4-1',
  '5-3-2',
] as const;

export const PLAYING_STYLE_OPTIONS = [
  'Possession-based',
  'Direct',
  'Counter-attacking',
  'High press',
  'Wide play',
  'Technical',
  'Physical',
  'Hybrid',
] as const;
