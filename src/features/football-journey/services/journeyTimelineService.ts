import { type JourneyFilterOption } from '@/features/football-journey/constants';
import {
  type JourneyEntry,
  type JourneyEntryType,
} from '@/features/football-journey/types';

export function filterJourneyEntries(
  entries: JourneyEntry[],
  filter: JourneyFilterOption,
): JourneyEntry[] {
  if (filter === 'all') {
    return entries;
  }
  return entries.filter((entry) => entry.type === filter);
}

export function formatJourneyDate(date: string, endDate?: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: 'numeric',
  });

  const start = formatter.format(new Date(date));
  if (!endDate) {
    return start;
  }

  const end = formatter.format(new Date(endDate));
  return `${start} – ${end}`;
}

export function getJourneyEntryAccent(type: JourneyEntryType): 'accent' | 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (type) {
    case 'injury':
      return 'error';
    case 'recovery':
    case 'gps_session':
      return 'success';
    case 'league_title':
    case 'cup_win':
      return 'warning';
    case 'international_callup':
    case 'highlight_video':
      return 'info';
    case 'professional_contract':
    case 'achievement':
    case 'coach_recommendation':
    case 'statistics_milestone':
      return 'accent';
    default:
      return 'default';
  }
}
