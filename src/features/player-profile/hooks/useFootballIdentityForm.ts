import { useCallback, useEffect, useState } from 'react';
import { createDefaultFootballIdentity } from '@/features/player-profile/models/FootballIdentityModel';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import { type PlayerProfile } from '@/features/player-profile/types';

export function useFootballIdentityForm(profile: PlayerProfile | null, visible: boolean) {
  const [identity, setIdentity] = useState<FootballIdentity>(createDefaultFootballIdentity());

  useEffect(() => {
    if (!visible || !profile) {
      return;
    }
    setIdentity(profile.identity);
  }, [profile, visible]);

  const updateIdentity = useCallback(
    <Key extends keyof FootballIdentity>(key: Key, value: FootballIdentity[Key]) => {
      setIdentity((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  return { identity, setIdentity, updateIdentity };
}
