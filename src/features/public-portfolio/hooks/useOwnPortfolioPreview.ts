import { useEffect, useMemo, useState } from 'react';
import { usePlayerProfile } from '@/features/player-profile/hooks/usePlayerProfile';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import { TrustRepository } from '@/features/trust-system/repositories/TrustRepository';
import { buildPublicPortfolioData } from '@/features/public-portfolio/models/PortfolioModel';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { type TrustRecommendation } from '@/features/trust-system/types';

export function useOwnPortfolioPreview(enabled: boolean) {
  const { profile } = usePlayerProfile();
  const [recommendations, setRecommendations] = useState<TrustRecommendation[]>([]);
  const [gpsHighlights, setGpsHighlights] = useState<PublicPortfolioData['gpsHighlights']>([]);

  useEffect(() => {
    if (!enabled || !profile?.id) {
      return;
    }

    const trustRepository = TrustRepository.getInstance();
    const unsubscribe = trustRepository.subscribeToPlayerRecommendations(
      profile.id,
      setRecommendations,
    );

    void GpsSessionRepository.getInstance()
      .fetchSessions(profile.id)
      .then((sessions) => setGpsHighlights(sessions.slice(0, 3)));

    return unsubscribe;
  }, [enabled, profile?.id]);

  return useMemo(() => {
    if (!enabled || !profile) {
      return null;
    }
    return buildPublicPortfolioData(profile, recommendations, gpsHighlights);
  }, [enabled, gpsHighlights, profile, recommendations]);
}
