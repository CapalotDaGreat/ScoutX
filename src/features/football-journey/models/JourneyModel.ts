import type {
  CareerTimelineEntry,
  CareerTimelineEntryType,
} from '@/features/player-profile/types/footballIdentity';
import type {
  FootballJourney,
  JourneyEntry,
  JourneyEntryType,
  JourneyMedia,
} from '@/features/football-journey/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const validTypes: JourneyEntryType[] = [
  'academy',
  'club_transfer',
  'achievement',
  'league_title',
  'cup_win',
  'international_callup',
  'injury',
  'recovery',
  'trial',
  'professional_contract',
  'highlight_video',
  'coach_recommendation',
  'gps_session',
  'statistics_milestone',
];

function parseMedia(value: unknown): JourneyMedia[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const media: JourneyMedia[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.url !== 'string') {
      continue;
    }
    const type = record.type === 'video' ? 'video' : 'image';
    media.push({
      type,
      url: record.url,
      thumbnailUrl: typeof record.thumbnailUrl === 'string' ? record.thumbnailUrl : undefined,
      caption: typeof record.caption === 'string' ? record.caption : undefined,
    });
  }
  return media;
}

function parseMetadata(value: unknown): Record<string, string | number | boolean> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, entryValue] of Object.entries(record)) {
    if (
      typeof entryValue === 'string' ||
      typeof entryValue === 'number' ||
      typeof entryValue === 'boolean'
    ) {
      metadata[key] = entryValue;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function parseJourneyEntry(value: unknown, index: number): JourneyEntry | null {
  const record = asRecord(value);
  if (!record || typeof record.title !== 'string' || typeof record.date !== 'string') {
    return null;
  }

  const type = validTypes.includes(record.type as JourneyEntryType)
    ? (record.type as JourneyEntryType)
    : 'achievement';

  const now = new Date().toISOString();

  return {
    id: typeof record.id === 'string' ? record.id : `journey-${index}`,
    type,
    title: record.title,
    subtitle: typeof record.subtitle === 'string' ? record.subtitle : undefined,
    organization: typeof record.organization === 'string' ? record.organization : undefined,
    description: typeof record.description === 'string' ? record.description : undefined,
    date: record.date,
    endDate: typeof record.endDate === 'string' ? record.endDate : undefined,
    media: parseMedia(record.media),
    metadata: parseMetadata(record.metadata),
    source:
      record.source === 'manual' || record.source === 'system' || record.source === 'legacy'
        ? record.source
        : 'manual',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

export function parseFootballJourney(value: unknown): FootballJourney {
  const record = asRecord(value);
  if (!record) {
    return { entries: [], updatedAt: new Date().toISOString() };
  }

  const entries: JourneyEntry[] = [];
  if (Array.isArray(record.entries)) {
    record.entries.forEach((item, index) => {
      const entry = parseJourneyEntry(item, index);
      if (entry) {
        entries.push(entry);
      }
    });
  }

  return {
    entries: sortJourneyEntries(entries),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}

export function serializeFootballJourney(journey: FootballJourney): Record<string, unknown> {
  return {
    // Firestore rejects undefined values, so unset optional fields are omitted.
    entries: journey.entries.map((entry) =>
      Object.fromEntries(
        Object.entries({
          id: entry.id,
          type: entry.type,
          title: entry.title,
          subtitle: entry.subtitle,
          organization: entry.organization,
          description: entry.description,
          date: entry.date,
          endDate: entry.endDate,
          media: entry.media,
          metadata: entry.metadata,
          source: entry.source,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        }).filter(([, value]) => value !== undefined),
      ),
    ),
    updatedAt: journey.updatedAt,
  };
}

const legacyTypeMap: Record<CareerTimelineEntryType, JourneyEntryType> = {
  club: 'club_transfer',
  achievement: 'achievement',
  transfer: 'club_transfer',
  education: 'academy',
};

function parseLegacyPeriod(period: string): { date: string; endDate?: string } {
  const parts = period.split('–').map((part) => part.trim());
  if (parts.length === 2) {
    const startYear = parts[0].match(/\d{4}/)?.[0];
    const endYear = parts[1].match(/\d{4}/)?.[0];
    if (startYear) {
      return {
        date: `${startYear}-01-01T00:00:00.000Z`,
        endDate: endYear ? `${endYear}-12-31T00:00:00.000Z` : undefined,
      };
    }
  }

  const year = period.match(/\d{4}/)?.[0];
  return { date: year ? `${year}-06-01T00:00:00.000Z` : new Date().toISOString() };
}

export function migrateLegacyCareerTimeline(entries: CareerTimelineEntry[]): JourneyEntry[] {
  const now = new Date().toISOString();

  return entries.map((entry, index) => {
    const dates = parseLegacyPeriod(entry.period);
    return {
      id: entry.id || `legacy-${index}`,
      type: legacyTypeMap[entry.type],
      title: entry.title,
      organization: entry.organization,
      description: entry.description,
      date: dates.date,
      endDate: dates.endDate,
      media: [],
      source: 'legacy' as const,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function sortJourneyEntries(entries: JourneyEntry[]): JourneyEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function groupJourneyByYear(entries: JourneyEntry[]): Array<{ year: string; entries: JourneyEntry[] }> {
  const sorted = sortJourneyEntries(entries);
  const groups = new Map<string, JourneyEntry[]>();

  for (const entry of sorted) {
    const year = new Date(entry.date).getFullYear().toString();
    const current = groups.get(year) ?? [];
    current.push(entry);
    groups.set(year, current);
  }

  return Array.from(groups.entries()).map(([year, yearEntries]) => ({
    year,
    entries: yearEntries,
  }));
}

export function createJourneyEntryId(): string {
  return `journey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveJourneyEntries(
  footballJourney: FootballJourney | undefined,
  legacyTimeline: CareerTimelineEntry[],
): JourneyEntry[] {
  if (footballJourney && footballJourney.entries.length > 0) {
    return sortJourneyEntries(footballJourney.entries);
  }

  if (legacyTimeline.length > 0) {
    return sortJourneyEntries(migrateLegacyCareerTimeline(legacyTimeline));
  }

  return [];
}

export function createEmptyJourneyEntry(type: JourneyEntryType = 'achievement'): JourneyEntry {
  const now = new Date().toISOString();
  return {
    id: createJourneyEntryId(),
    type,
    title: '',
    date: now,
    media: [],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
  };
}
