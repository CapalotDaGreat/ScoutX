import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePlayerProfile } from '@/features/player-profile/hooks/usePlayerProfile';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import { buildPublicPortfolioData } from '@/features/public-portfolio/models/PortfolioModel';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { usePlayerTrust, type UsePlayerTrustResult } from '@/features/trust-system/hooks/usePlayerTrust';
import { usePushNotificationRegistration } from '@/features/notifications/hooks/usePushNotificationRegistration';
import { type GpsSession } from '@/features/gps/types';

type PlayerWorkspaceContextValue = ReturnType<typeof usePlayerProfile> & {
  trustState: UsePlayerTrustResult;
  portfolioPreview: PublicPortfolioData | null;
};

const PlayerWorkspaceContext = createContext<PlayerWorkspaceContextValue | null>(null);

type PlayerWorkspaceProviderProps = {
  children: ReactNode;
};

export function PlayerWorkspaceProvider({ children }: PlayerWorkspaceProviderProps) {
  const profileState = usePlayerProfile();
  const { profile } = profileState;
  const trustState = usePlayerTrust(profile?.id ?? '', {
    currentClub: profile?.identity.currentClub,
    clubHistory: profile?.identity.clubHistory ?? [],
    playerName: profile?.fullName ?? 'Player',
  });
  usePushNotificationRegistration(Boolean(profile?.id));
  const [gpsHighlights, setGpsHighlights] = useState<GpsSession[]>([]);

  useEffect(() => {
    if (!profile?.id) {
      setGpsHighlights([]);
      return;
    }

    let cancelled = false;
    void GpsSessionRepository.getInstance()
      .fetchSessions(profile.id)
      .then((sessions) => {
        if (!cancelled) {
          setGpsHighlights(sessions.slice(0, 3));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const portfolioPreview = useMemo(() => {
    if (!profile) {
      return null;
    }
    return buildPublicPortfolioData(profile, trustState.recommendations, gpsHighlights);
  }, [gpsHighlights, profile, trustState.recommendations]);

  const value = useMemo(
    () => ({
      ...profileState,
      trustState,
      portfolioPreview,
    }),
    [portfolioPreview, profileState, trustState],
  );

  return (
    <PlayerWorkspaceContext.Provider value={value}>{children}</PlayerWorkspaceContext.Provider>
  );
}

export function usePlayerWorkspace(): PlayerWorkspaceContextValue {
  const context = useContext(PlayerWorkspaceContext);
  if (!context) {
    throw new Error('usePlayerWorkspace must be used within PlayerWorkspaceProvider.');
  }
  return context;
}
