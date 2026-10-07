import { useEffect, useMemo, useState } from 'react';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import type { CareerRecords } from '@/features/career-story/services/careerSeasons';
import { DevelopmentRepository } from '@/features/development/repositories/DevelopmentRepository';
import type { DevelopmentGoal } from '@/features/development/types';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import type { ReelManifest } from '@/features/reel-studio/types';
import { RequestCenterRepository } from '@/features/request-center/repositories/RequestCenterRepository';
import type { VerificationLike } from '@/features/request-center/services/requestCenterService';
import { usePlayerTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';

/** Every record the player owns that feeds career views. */
export function useCareerRecords(): { records: CareerRecords; playerId: string | null } {
  const { profile } = usePlayerWorkspace();
  const { trials } = usePlayerTrialInvitations();
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [reels, setReels] = useState<ReelManifest[]>([]);
  const [verifications, setVerifications] = useState<VerificationLike[]>([]);
  const playerId = profile?.id ?? null;

  useEffect(() => {
    if (!playerId || !isFirebaseConfiguredForProject()) {
      setGoals([]);
      setReels([]);
      setVerifications([]);
      return undefined;
    }
    let cancelled = false;
    const keep = <T,>(setter: (value: T) => void) => (value: T) => {
      if (!cancelled) setter(value);
    };
    void DevelopmentRepository.getInstance().listGoals(playerId).then(keep(setGoals)).catch(() => undefined);
    void ReelRepository.getInstance().listReels(playerId).then(keep(setReels)).catch(() => undefined);
    void RequestCenterRepository.getInstance()
      .listVerificationRequests(playerId)
      .then(keep(setVerifications))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const records = useMemo<CareerRecords>(
    () => ({
      matches: (profile?.statisticsMatches ?? []).map((match) => ({
        id: match.id,
        date: match.date,
        opponent: match.opponent,
        position: match.position,
        minutes: match.minutes,
        goals: match.goals,
        assists: match.assists,
      })),
      journey: profile?.footballJourney?.entries ?? [],
      trials,
      goals,
      reels,
      clips: (profile?.highlightVideos?.videos ?? []).map((video) => ({ id: video.id, title: video.title, date: video.date })),
      verifications: verifications.map((item) => ({
        id: item.id,
        status: item.status,
        evidence: item.evidence,
        updatedAt: item.updatedAt || item.createdAt,
      })),
    }),
    [goals, profile, reels, trials, verifications],
  );

  return { records, playerId };
}
