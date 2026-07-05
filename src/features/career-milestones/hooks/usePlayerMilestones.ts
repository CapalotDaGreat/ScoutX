import { useEffect, useMemo, useRef, useState } from 'react';
import { PortfolioAnalyticsRepository } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import {
  listEarnedMilestoneDefinitions,
  syncPlayerMilestones,
} from '@/features/career-milestones/services/milestoneService';
import { type MilestoneDefinition } from '@/features/career-milestones/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type TrustRecommendation } from '@/features/trust-system/types';

export type UsePlayerMilestonesResult = {
  earned: MilestoneDefinition[];
  recentlyEarned: MilestoneDefinition[];
  isSyncing: boolean;
};

function buildSyncKey(
  profile: PlayerProfile,
  recommendations: TrustRecommendation[],
  scoutViews: number,
  totalViews: number,
): string {
  return [
    profile.id,
    profile.earnedMilestones?.length ?? 0,
    profile.statisticsMatches?.length ?? 0,
    profile.highlightVideos?.videos.length ?? 0,
    profile.username ?? '',
    profile.privacy?.publicPortfolioEnabled ?? false,
    profile.privacy?.discoverableByScouts ?? false,
    recommendations.length,
    scoutViews,
    totalViews,
  ].join(':');
}

export function usePlayerMilestones(
  profile: PlayerProfile | null,
  recommendations: TrustRecommendation[],
): UsePlayerMilestonesResult {
  const [recentlyEarned, setRecentlyEarned] = useState<MilestoneDefinition[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncKeyRef = useRef('');

  const earned = useMemo(
    () => (profile ? listEarnedMilestoneDefinitions(profile) : []),
    [profile],
  );

  useEffect(() => {
    if (!profile?.id) {
      setRecentlyEarned([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsSyncing(true);
      try {
        const analytics = await PortfolioAnalyticsRepository.getInstance().fetchAnalytics(
          profile.id,
        );
        const syncKey = buildSyncKey(
          profile,
          recommendations,
          analytics.scoutViews,
          analytics.totalViews,
        );

        if (syncKeyRef.current === syncKey) {
          return;
        }

        const newlyEarned = await syncPlayerMilestones({
          profile,
          recommendations,
          analytics,
        });

        if (!cancelled) {
          syncKeyRef.current = syncKey;
          if (newlyEarned.length > 0) {
            setRecentlyEarned(newlyEarned);
          }
        }
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [profile, recommendations]);

  return { earned, recentlyEarned, isSyncing };
}
