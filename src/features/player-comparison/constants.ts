export const MAX_COMPARISON_PLAYERS = 4;

export const COMPARISON_PLAYER_COLORS = [
  '#16A34A',
  '#2563EB',
  '#CA8A04',
  '#DC2626',
] as const;

export const COMPARISON_SECTION_LABELS = {
  radar: 'Radar Profile',
  statistics: 'Statistics',
  trends: 'Performance Trends',
  physical: 'Physical Attributes',
  technical: 'Technical Ratings',
  gps: 'GPS Metrics',
  career: 'Career Progression',
  videos: 'Highlight Videos',
  achievements: 'Achievements',
} as const;

export const COMPARISON_WORKSPACE_KEY = 'comparisonPlayerIds';
