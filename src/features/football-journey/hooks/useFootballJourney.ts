import { useCallback, useMemo } from 'react';
import {
  resolveJourneyEntries,
  sortJourneyEntries,
} from '@/features/football-journey/models/JourneyModel';
import {
  type FootballJourney,
  type JourneyEntry,
  emptyFootballJourney,
} from '@/features/football-journey/types';
import { type PlayerProfile } from '@/features/player-profile/types';

export function useFootballJourney(profile: PlayerProfile | null | undefined) {
  const entries = useMemo(() => {
    if (!profile) {
      return [];
    }
    return resolveJourneyEntries(profile.footballJourney, profile.identity.careerTimeline);
  }, [profile]);

  const footballJourney = profile?.footballJourney ?? emptyFootballJourney();

  const buildJourneyUpdate = useCallback(
    (nextEntries: JourneyEntry[]): Partial<PlayerProfile> => {
      const journey: FootballJourney = {
        entries: sortJourneyEntries(nextEntries),
        updatedAt: new Date().toISOString(),
      };
      return { footballJourney: journey };
    },
    [],
  );

  return {
    entries,
    footballJourney,
    buildJourneyUpdate,
    hasPersistedJourney: (profile?.footballJourney?.entries.length ?? 0) > 0,
  };
}
