import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrustRepository } from '@/features/trust-system/repositories/TrustRepository';
import {
  buildClubTenures,
  createDefaultTrustProfile,
  sortRecommendations,
} from '@/features/trust-system/models/TrustModel';
import { type ClubHistoryEntry } from '@/features/player-profile/types/footballIdentity';
import {
  type TrustProfile,
  type TrustRecommendation,
  type TrustRecommendationDraft,
  type ClubTenure,
} from '@/features/trust-system/types';

export type UsePlayerTrustOptions = {
  currentClub?: string;
  clubHistory?: ClubHistoryEntry[];
  playerName?: string;
};

export type UsePlayerTrustResult = {
  trustProfile: TrustProfile;
  recommendations: TrustRecommendation[];
  clubTenures: ClubTenure[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveRecommendation: (
    authorId: string,
    authorName: string,
    authorAvatarUrl: string,
    draft: TrustRecommendationDraft,
    existing?: TrustRecommendation,
  ) => Promise<TrustRecommendation>;
  deleteRecommendation: (recommendationId: string) => Promise<void>;
};

export function usePlayerTrust(playerId: string, options: UsePlayerTrustOptions = {}): UsePlayerTrustResult {
  const { currentClub = '', clubHistory = [], playerName = 'Player' } = options;
  const [trustProfile, setTrustProfile] = useState<TrustProfile>(() =>
    createDefaultTrustProfile(playerId),
  );
  const [recommendations, setRecommendations] = useState<TrustRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repository = useMemo(() => TrustRepository.getInstance(), []);

  useEffect(() => {
    if (!playerId) {
      setTrustProfile(createDefaultTrustProfile(''));
      setRecommendations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    let profileReady = false;
    let recommendationsReady = false;

    const markReady = () => {
      if (profileReady && recommendationsReady) {
        setIsLoading(false);
      }
    };

    const unsubscribeProfile = repository.subscribeToTrustProfile(
      playerId,
      (profile) => {
        setTrustProfile(profile);
        profileReady = true;
        markReady();
      },
      (err) => {
        setError(err.message);
        profileReady = true;
        markReady();
      },
    );

    const unsubscribeRecommendations = repository.subscribeToPlayerRecommendations(
      playerId,
      (nextRecommendations) => {
        setRecommendations(sortRecommendations(nextRecommendations));
        recommendationsReady = true;
        markReady();
      },
      (err) => {
        setError(err.message);
        recommendationsReady = true;
        markReady();
      },
    );

    return () => {
      unsubscribeProfile();
      unsubscribeRecommendations();
    };
  }, [playerId, repository]);

  const clubTenures = useMemo<ClubTenure[]>(
    () => buildClubTenures(currentClub, clubHistory),
    [clubHistory, currentClub],
  );

  const saveRecommendation = useCallback(
    async (
      authorId: string,
      authorName: string,
      authorAvatarUrl: string,
      draft: TrustRecommendationDraft,
      existing?: TrustRecommendation,
    ) => {
      setIsSaving(true);
      setError(null);
      try {
        return await repository.saveRecommendation(
          playerId,
          playerName,
          authorId,
          authorName,
          authorAvatarUrl,
          draft,
          existing,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save recommendation.';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [playerId, playerName, repository],
  );

  const deleteRecommendation = useCallback(
    async (recommendationId: string) => {
      setIsSaving(true);
      setError(null);
      try {
        await repository.deleteRecommendation(playerId, recommendationId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete recommendation.';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [playerId, repository],
  );

  return {
    trustProfile,
    recommendations,
    clubTenures,
    isLoading,
    isSaving,
    error,
    saveRecommendation,
    deleteRecommendation,
  };
}
