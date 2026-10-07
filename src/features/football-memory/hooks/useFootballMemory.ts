import { useEffect, useMemo, useState } from 'react';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { buildMemoryIndex, type MemoryRecord } from '@/features/football-memory/services/footballMemory';
import { listRecentMatchAnalysisJobs } from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import type { MatchAnalysisJob } from '@/features/match-analysis/types';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import type { ReelManifest } from '@/features/reel-studio/types';
import { usePlayerTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';

/** The signed-in player's own records as a searchable memory index. */
export function useFootballMemory(): { index: MemoryRecord[]; isLoading: boolean } {
  const { user } = useAuth();
  const { profile, isLoading: profileLoading } = usePlayerWorkspace();
  const { trials } = usePlayerTrialInvitations();
  const [reels, setReels] = useState<ReelManifest[]>([]);
  const [analyses, setAnalyses] = useState<MatchAnalysisJob[]>([]);
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!uid || !isFirebaseConfiguredForProject()) {
      setReels([]);
      setAnalyses([]);
      return undefined;
    }
    let cancelled = false;
    void ReelRepository.getInstance()
      .listReels(uid)
      .then((next) => {
        if (!cancelled) setReels(next);
      })
      .catch(() => undefined);
    void listRecentMatchAnalysisJobs(uid)
      .then((next) => {
        if (!cancelled) setAnalyses(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const index = useMemo(
    () =>
      buildMemoryIndex({
        matches: (profile?.statisticsMatches ?? []).map((match) => ({ ...match, position: match.position ?? profile?.position })),
        journey: profile?.footballJourney?.entries ?? [],
        trials,
        videos: profile?.highlightVideos?.videos ?? [],
        reels,
        analyses,
      }),
    [analyses, profile, reels, trials],
  );

  return { index, isLoading: profileLoading };
}
