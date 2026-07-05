import { useCallback, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { PostRepository } from '@/features/social-feed/repositories/PostRepository';
import { buildAuthorFromUser, buildPostFromDraft } from '@/features/social-feed/models/PostModel';
import { POST_MEDIA_LIMITS } from '@/features/social-feed/constants';
import { uploadPostClip, uploadPostImage } from '@/features/social-feed/services/postMediaService';
import { compressHighlightVideo } from '@/features/highlight-videos/services/videoCompressionService';
import { pickHighlightVideo } from '@/features/highlight-videos/services/videoPickerService';
import { type SocialPost, type SocialPostDraft } from '@/features/social-feed/types';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { PlayerProfileRepository } from '@/features/player-profile/repositories/PlayerProfileRepository';
import { defaultPrivacySettings } from '@/features/player-profile/types/privacySettings';

export type CreatePostInput = {
  type: SocialPost['type'];
  text?: string;
  trialDetails?: SocialPostDraft['trialDetails'];
  imageUri?: string;
  videoUri?: string;
};

export function useCreatePost() {
  const { user } = useAuth();
  const repository = useMemo(() => PostRepository.getInstance(), []);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const validateMedia = useCallback(async (input: CreatePostInput): Promise<string | null> => {
    if (input.type === 'clip' && input.videoUri) {
      const picked = await pickHighlightVideo();
      if (!picked) {
        return 'Video selection cancelled.';
      }
      if (picked.durationSec > POST_MEDIA_LIMITS.maxClipDurationSec) {
        return `Clips must be ${POST_MEDIA_LIMITS.maxClipDurationSec} seconds or shorter.`;
      }
    }

    if (input.type === 'photo') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return 'Photo library permission is required.';
      }
    }

    return null;
  }, []);

  const createPost = useCallback(
    async (
      input: CreatePostInput,
      onOptimistic?: (post: SocialPost) => void,
      onComplete?: (post: SocialPost) => void,
    ) => {
      if (!user?.id) {
        throw new Error('You must be signed in to post.');
      }

      setIsCreating(true);
      setError(null);
      setUploadProgress(0);

      const validationError = await validateMedia(input);
      if (validationError) {
        setError(validationError);
        setIsCreating(false);
        throw new Error(validationError);
      }

      const author = buildAuthorFromUser({
        id: user.id,
        name: user.name,
        role: user.role,
      });

      let visibility: 'public' | 'hidden' = 'public';
      try {
        const profile = await PlayerProfileRepository.getInstance().fetchProfile(user.id);
        const privacy = profile?.privacy ?? defaultPrivacySettings();
        visibility = privacy.allowSocialPostsInFeed ? 'public' : 'hidden';
      } catch {
        visibility = 'public';
      }

      const draft: SocialPostDraft = {
        type: input.type,
        text: input.text,
        trialDetails: input.trialDetails,
        author,
        visibility,
      };

      let post = buildPostFromDraft(draft);
      post = { ...post, uploadStatus: input.type === 'text' || input.type === 'trial_invite' ? 'ready' : 'uploading' };
      onOptimistic?.(post);

      try {
        const saved = await repository.createPost(draft);

        if (input.type === 'photo' && input.imageUri) {
          const mediaUrl = await uploadPostImage(user.id, saved.id, input.imageUri, (progress) => {
            setUploadProgress(progress.progress);
          });
          const ready = await repository.updatePost(saved.id, {
            mediaUrl,
            thumbnailUrl: mediaUrl,
            uploadStatus: 'ready',
          });
          if (ready) {
            onComplete?.(ready);
            return ready;
          }
        }

        if (input.type === 'clip') {
          const picked = input.videoUri
            ? { uri: input.videoUri, durationSec: POST_MEDIA_LIMITS.maxClipDurationSec }
            : await pickHighlightVideo();
          if (!picked) {
            throw new Error('Video selection cancelled.');
          }
          const compressed = await compressHighlightVideo(picked);
          const { videoUrl } = await uploadPostClip(user.id, saved.id, compressed.uri, (progress) => {
            setUploadProgress(progress.progress);
          });
          const ready = await repository.updatePost(saved.id, {
            mediaUrl: videoUrl,
            thumbnailUrl: saved.thumbnailUrl,
            uploadStatus: 'ready',
          });
          if (ready) {
            onComplete?.(ready);
            return ready;
          }
        }

        onComplete?.(saved);
        return saved;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create post.';
        setError(message);
        await repository.updatePost(post.id, { uploadStatus: 'failed' });
        throw err;
      } finally {
        setIsCreating(false);
        setUploadProgress(0);
      }
    },
    [repository, user, validateMedia],
  );

  return {
    createPost,
    isCreating,
    uploadProgress,
    error,
  };
}
