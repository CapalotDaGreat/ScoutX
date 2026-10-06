import { type MilestoneDefinition } from '@/features/career-milestones/types';
import { type FootballJourney, type JourneyEntry } from '@/features/football-journey/types';
import {
  createJourneyEntryId,
  sortJourneyEntries,
} from '@/features/football-journey/models/JourneyModel';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

type SystemEvent =
  | { type: 'match_logged'; match: PlayerMatchStatistics }
  | { type: 'portfolio_enabled' }
  | { type: 'discoverable_enabled' }
  | { type: 'professional_milestone'; milestone: MilestoneDefinition };

function emptyJourney(): FootballJourney {
  return { entries: [], updatedAt: new Date().toISOString() };
}

function createSystemEntry(
  type: JourneyEntry['type'],
  title: string,
  subtitle: string | undefined,
  date: string,
  metadata?: JourneyEntry['metadata'],
): JourneyEntry {
  const now = new Date().toISOString();
  return {
    id: createJourneyEntryId(),
    type,
    title,
    subtitle,
    date,
    metadata,
    media: [],
    source: 'system',
    createdAt: now,
    updatedAt: now,
  };
}

export function appendSystemJourneyEvents(
  journey: FootballJourney | undefined,
  event: SystemEvent,
): FootballJourney {
  const base = journey ?? emptyJourney();
  const entries = [...base.entries];

  if (event.type === 'match_logged') {
    const { match } = event;
    const title =
      match.goals > 0
        ? `Scored ${match.goals} vs ${match.opponent}`
        : match.assists > 0
          ? `Assisted vs ${match.opponent}`
          : `Played vs ${match.opponent}`;
    entries.unshift(
      createSystemEntry(
        'statistics_milestone',
        title,
        `${match.competition} · ${match.result}`,
        match.date,
        {
          goals: match.goals,
          assists: match.assists,
          minutes: match.minutes,
          ...(match.matchRating !== null ? { rating: match.matchRating } : {}),
        },
      ),
    );
  }

  if (event.type === 'portfolio_enabled') {
    entries.unshift(
      createSystemEntry(
        'achievement',
        'Public portfolio enabled',
        'Shareable football identity is now live',
        new Date().toISOString(),
      ),
    );
  }

  if (event.type === 'discoverable_enabled') {
    entries.unshift(
      createSystemEntry(
        'achievement',
        'Discoverable by scouts',
        'Your profile can appear in scout search',
        new Date().toISOString(),
      ),
    );
  }

  if (event.type === 'professional_milestone') {
    const { milestone } = event;
    entries.unshift(
      createSystemEntry(
        'achievement',
        `${milestone.icon} ${milestone.title}`,
        milestone.description,
        new Date().toISOString(),
        { milestoneId: milestone.id, category: milestone.category },
      ),
    );
  }

  return {
    entries: sortJourneyEntries(entries).slice(0, 100),
    updatedAt: new Date().toISOString(),
  };
}

export function buildUnifiedCareerTimeline(journey: FootballJourney | undefined): JourneyEntry[] {
  return sortJourneyEntries(journey?.entries ?? []);
}
