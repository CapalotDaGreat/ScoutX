import { type QueryClient } from '@tanstack/react-query';
import { type DiscoveryQuery } from '@/features/scout-discovery/types';

/**
 * Single source of truth for TanStack Query keys. Every key starts with a stable domain
 * segment so a whole domain can be invalidated with `queryClient.invalidateQueries`.
 */
export const queryKeys = {
  profile: {
    all: ['profile'] as const,
    byUser: (userId: string) => ['profile', userId] as const,
    matches: (userId: string) => ['profile', userId, 'matches'] as const,
    media: (userId: string) => ['profile', userId, 'media'] as const,
    evidence: (userId: string) => ['profile', userId, 'evidence'] as const,
  },
  passport: {
    all: ['passport'] as const,
    public: (userId: string) => ['passport', 'public', userId] as const,
    summary: (userId: string) => ['passport', 'summary', userId] as const,
  },
  development: {
    all: ['development'] as const,
    goals: (userId: string) => ['development', userId, 'goals'] as const,
    trainingSessions: (userId: string) => ['development', userId, 'training'] as const,
    coachingMoments: (userId: string) => ['development', userId, 'coaching'] as const,
    snapshots: (userId: string) => ['development', userId, 'snapshots'] as const,
  },
  matchAnalysis: {
    all: ['match-analysis'] as const,
    jobs: (userId: string) => ['match-analysis', userId, 'jobs'] as const,
    job: (jobId: string) => ['match-analysis', 'job', jobId] as const,
  },
  reels: {
    all: ['reels'] as const,
    byUser: (userId: string) => ['reels', userId] as const,
  },
  scoutDiscovery: {
    all: ['scout-discovery'] as const,
    page: (query: DiscoveryQuery) => ['scout-discovery', query] as const,
    player: (playerId: string) => ['scout-discovery', 'player', playerId] as const,
    dashboard: ['scout-discovery', 'dashboard'] as const,
  },
  trials: {
    all: ['trials'] as const,
    forPlayer: (userId: string) => ['trials', 'player', userId] as const,
    forScout: (scoutId: string) => ['trials', 'scout', scoutId] as const,
  },
  today: {
    all: ['today'] as const,
    plan: (userId: string) => ['today', userId] as const,
  },
} as const;

/**
 * Invalidation helpers used after mutations so dependent screens refresh without the
 * caller needing to know every key that depends on a domain.
 */
export const invalidate = {
  async profile(client: QueryClient, userId: string): Promise<void> {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.profile.byUser(userId) }),
      client.invalidateQueries({ queryKey: queryKeys.passport.all }),
      client.invalidateQueries({ queryKey: queryKeys.today.plan(userId) }),
    ]);
  },
  async matches(client: QueryClient, userId: string): Promise<void> {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.profile.matches(userId) }),
      client.invalidateQueries({ queryKey: queryKeys.profile.byUser(userId) }),
      client.invalidateQueries({ queryKey: queryKeys.today.plan(userId) }),
    ]);
  },
  async matchAnalysis(client: QueryClient, userId: string): Promise<void> {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.matchAnalysis.jobs(userId) }),
      client.invalidateQueries({ queryKey: queryKeys.today.plan(userId) }),
    ]);
  },
  async scoutDiscovery(client: QueryClient): Promise<void> {
    await client.invalidateQueries({ queryKey: queryKeys.scoutDiscovery.all });
  },
};
