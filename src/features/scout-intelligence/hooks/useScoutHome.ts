import { useEffect, useMemo, useState } from 'react';
import { RequestCenterRepository } from '@/features/request-center/repositories/RequestCenterRepository';
import type { StoredEvidenceRequest } from '@/features/request-center/types';
import type { DiscoverablePlayer, FilterPreset } from '@/features/scout-discovery/types';
import { loadSeenAt, saveSeenAt } from '@/features/intelligence/services/snapshotStore';
import { useWatchlistEvents } from '@/features/scout-intelligence/hooks/useWatchlistEvents';
import { bestBriefMatch, isFullBriefFit, isOwnBrief } from '@/features/scout-intelligence/services/briefMatch';
import {
  buildScoutAttention,
  buildScoutFirstSession,
  type ScoutAttentionItem,
  type ScoutFirstSessionStep,
} from '@/features/scout-intelligence/services/scoutDecisionSupport';
import { TrialInvitationRepository } from '@/features/trial-invitations/repositories/TrialInvitationRepository';
import type { TrialInvitation } from '@/features/trial-invitations/types';

const SEEN_SCOPE = 'scout-home';

/**
 * Scout Home 2.0 inputs: what needs a decision (attention) and how far a new scout is through
 * the first session. Everything is derived from the scout's own records.
 */
export function useScoutHome(input: {
  scoutId: string | null;
  presets: readonly FilterPreset[];
  candidates: readonly DiscoverablePlayer[];
  viewedCount: number;
  shortlistCount: number;
}): { attention: ScoutAttentionItem[]; firstSession: ScoutFirstSessionStep[] } {
  const { scoutId, presets, candidates, viewedCount, shortlistCount } = input;
  const { events } = useWatchlistEvents(scoutId, 20);
  const [requests, setRequests] = useState<StoredEvidenceRequest[]>([]);
  const [trials, setTrials] = useState<TrialInvitation[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);

  useEffect(() => {
    if (!scoutId) {
      setRequests([]);
      return undefined;
    }
    let cancelled = false;
    void RequestCenterRepository.getInstance()
      .listScoutEvidenceRequests(scoutId)
      .then((next) => {
        if (!cancelled) setRequests(next);
      })
      .catch(() => {
        if (!cancelled) setRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [scoutId]);

  useEffect(() => {
    if (!scoutId) {
      setTrials([]);
      return undefined;
    }
    return TrialInvitationRepository.getInstance().subscribeToScoutTrials(scoutId, setTrials, () => setTrials([]));
  }, [scoutId]);

  useEffect(() => {
    if (!scoutId) return undefined;
    let cancelled = false;
    void loadSeenAt(scoutId, SEEN_SCOPE).then((previous) => {
      if (cancelled) return;
      setSeenAt(previous);
      void saveSeenAt(scoutId, SEEN_SCOPE, new Date().toISOString());
    });
    return () => {
      cancelled = true;
    };
  }, [scoutId]);

  const ownBriefs = useMemo(() => presets.filter(isOwnBrief), [presets]);

  const attention = useMemo(() => {
    const briefFits: Array<{ playerId: string; playerName: string; briefName: string; updatedAt: string }> = [];
    const seen = new Set<string>();
    for (const player of candidates) {
      if (seen.has(player.id)) continue;
      const match = bestBriefMatch(player, ownBriefs);
      if (match && isFullBriefFit(match)) {
        seen.add(player.id);
        briefFits.push({
          playerId: player.id,
          playerName: player.fullName,
          briefName: match.presetName,
          updatedAt: player.updatedAt,
        });
      }
    }
    return buildScoutAttention({
      fulfilledRequests: requests.filter((request) => request.status === 'fulfilled'),
      trials,
      events,
      briefFits,
      seenAt,
    });
  }, [candidates, events, ownBriefs, requests, seenAt, trials]);

  const firstSession = useMemo(
    () =>
      buildScoutFirstSession({
        ownBriefCount: ownBriefs.length,
        viewedCount,
        shortlistCount,
        requestCount: requests.length,
        trialCount: trials.length,
      }),
    [ownBriefs.length, requests.length, shortlistCount, trials.length, viewedCount],
  );

  return { attention, firstSession };
}
