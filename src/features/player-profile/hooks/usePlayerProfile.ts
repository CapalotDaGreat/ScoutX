import { useEffect, useMemo, useState, useCallback } from 'react';
import { PlayerProfileRepository } from '@/features/player-profile/repositories/PlayerProfileRepository';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type MatchLogPayload } from '@/features/player-statistics';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';

export function usePlayerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const repository = PlayerProfileRepository.getInstance();
    
    const unsubscribe = repository.subscribeToProfile(
      user.id,
      (nextProfile) => {
        setProfile(nextProfile);
        setIsLoading(false);
      },
      (err) => {
        setError(err.message || 'Unable to sync profile.');
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user?.id]);

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
        const message = err instanceof Error ? err.message : 'Failed to update profile.';
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
        const message = err instanceof Error ? err.message : 'Failed to upload image.';
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
      setProfile(nextProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh profile.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

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
        const message = err instanceof Error ? err.message : 'Failed to save match.';
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
    [error, isLoading, isSaving, profile, saveMatch, saveProfile, uploadImage, refreshProfile]
  );
}
