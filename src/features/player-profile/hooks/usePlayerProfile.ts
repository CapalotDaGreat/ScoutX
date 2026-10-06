import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { PlayerProfileRepository } from '@/features/player-profile/repositories/PlayerProfileRepository';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type MatchLogPayload } from '@/features/player-statistics';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';
import { toUserMessage } from '@/utils/userFacingError';

const PROFILE_LOAD_TIMEOUT_MS = 4_000;

function buildSeedProfile(userId: string, name?: string | null, email?: string | null): PlayerProfile {
  const seeded = ProfileModel.getDefaultProfile(userId, email?.trim() || 'player@scoutx.app');
  if (name?.trim()) {
    seeded.fullName = name.trim();
  }
  return seeded;
}

export function usePlayerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasResolvedRef = useRef(false);

  useEffect(() => {
    hasResolvedRef.current = false;

    if (!user?.id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const repository = PlayerProfileRepository.getInstance();
    const userId = user.id;

    const resolveWithSeed = () => {
      if (hasResolvedRef.current) {
        return;
      }
      hasResolvedRef.current = true;
      const seeded = buildSeedProfile(userId, user.name, user.email);
      setProfile(seeded);
      setIsLoading(false);
      void repository.updateProfile(userId, seeded).catch(() => {
        // Offline / rules — keep local seed so Home still renders
      });
    };

    const unsubscribe = repository.subscribeToProfile(
      userId,
      (nextProfile) => {
        if (nextProfile) {
          hasResolvedRef.current = true;
          setProfile(nextProfile);
          setIsLoading(false);
          return;
        }
        resolveWithSeed();
      },
      (err) => {
        setError(err.message || 'Unable to sync profile.');
        resolveWithSeed();
      },
    );

    const timeoutId = setTimeout(() => {
      if (!hasResolvedRef.current) {
        resolveWithSeed();
      }
    }, PROFILE_LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [user?.email, user?.id, user?.name]);

  const saveProfile = useCallback(
    async (data: Partial<PlayerProfile>) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }
      setIsSaving(true);
      setError(null);
      try {
        const repository = PlayerProfileRepository.getInstance();
        await repository.updateProfile(user.id, data);
        const playerName =
          (typeof data.fullName === 'string' ? data.fullName : undefined) ??
          profile?.fullName ??
          user.name;
        ActivityRecorder.getInstance().recordProfileUpdated(user.id, playerName);
      } catch (err) {
        const message = toUserMessage(err, 'Failed to update profile.');
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [profile?.fullName, user?.id, user?.name],
  );

  const uploadImage = useCallback(
    async (fileUri: string, type: 'avatar' | 'cover') => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }
      setIsSaving(true);
      setError(null);
      try {
        const repository = PlayerProfileRepository.getInstance();
        const downloadUrl = await repository.uploadImage(user.id, fileUri, type);

        const field = type === 'avatar' ? 'avatarUrl' : 'coverImageUrl';
        await repository.updateProfile(user.id, { [field]: downloadUrl });
        ActivityRecorder.getInstance().recordProfileUpdated(
          user.id,
          profile?.fullName ?? user.name,
        );

        return downloadUrl;
      } catch (err) {
        const message = toUserMessage(err, 'Failed to upload image.');
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [profile?.fullName, user?.id, user?.name],
  );

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const repository = PlayerProfileRepository.getInstance();
      const nextProfile = await repository.fetchProfile(user.id);
      if (nextProfile) {
        setProfile(nextProfile);
      } else {
        setProfile(buildSeedProfile(user.id, user.name, user.email));
      }
    } catch (err) {
      setError(toUserMessage(err, 'Unable to refresh profile.'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, user?.id, user?.name]);

  const saveMatch = useCallback(
    async (payload: MatchLogPayload) => {
      if (!user?.id) {
        throw new Error('User is not authenticated.');
      }

      setIsSaving(true);
      setError(null);
      try {
        const repository = PlayerProfileRepository.getInstance();
        return await repository.appendMatch(user.id, payload);
      } catch (err) {
        const message = toUserMessage(err, 'Failed to save match.');
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [user?.id],
  );

  return useMemo(
    () => ({
      profile,
      isLoading,
      isSaving,
      error,
      saveProfile,
      saveMatch,
      uploadImage,
      refreshProfile,
    }),
    [error, isLoading, isSaving, profile, saveMatch, saveProfile, uploadImage, refreshProfile],
  );
}
