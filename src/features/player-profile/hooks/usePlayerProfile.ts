import { useEffect, useMemo, useState } from 'react';
import { getMockPlayerProfile } from '@/features/player-profile/services/mockPlayerProfileService';
import { type PlayerProfile } from '@/features/player-profile/types';

export function usePlayerProfile() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      try {
        setIsLoading(true);
        setError(null);
        const nextProfile = await getMockPlayerProfile();
        if (isActive) {
          setProfile(nextProfile);
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load profile.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, []);

  return useMemo(() => ({ profile, isLoading, error }), [error, isLoading, profile]);
}
