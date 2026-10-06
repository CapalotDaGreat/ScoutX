import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { ChevronDown, ChevronUp, Trash2, Upload } from 'lucide-react-native';
import { Modal } from '@/components/feedback/Modal';
import { useSnackbar } from '@/components/feedback/Snackbar';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { HighlightVideoCard } from '@/features/highlight-videos/components/HighlightVideoCard';
import { HighlightVideoEditorModal } from '@/features/highlight-videos/components/HighlightVideoEditorModal';
import { HighlightVideoPlayerModal } from '@/features/highlight-videos/components/HighlightVideoPlayerModal';
import { HighlightVideoUploadProgress } from '@/features/highlight-videos/components/HighlightVideoUploadProgress';
import { useHighlightVideos } from '@/features/highlight-videos/hooks/useHighlightVideos';
import { sortHighlightVideos } from '@/features/highlight-videos/models/HighlightVideoModel';
import { waitForModalDismiss } from '@/features/highlight-videos/services/videoLibraryPermission';
import { type HighlightVideo } from '@/features/highlight-videos/types';
import { type PlayerProfile } from '@/features/player-profile/types';
import { useTheme } from '@/theme';
import { toUserMessage } from '@/utils/userFacingError';

export type HighlightVideosManagerModalProps = {
  visible: boolean;
  profile: PlayerProfile;
  onClose: () => void;
  onAnalyzeMatchVideoPress?: () => void;
  onOpenHighlightReelStudio?: () => void;
};

type ManagerFlowPhase = 'list' | 'picking' | 'editing';

export function HighlightVideosManagerModal({
  visible,
  profile,
  onClose,
  onAnalyzeMatchVideoPress,
  onOpenHighlightReelStudio,
}: HighlightVideosManagerModalProps) {
  const { colors } = useTheme();
  const {
    library,
    uploadProgress,
    isUploading,
    pickAndPrepareUpload,
    completeUpload,
    deleteVideo,
    updateVideo,
    reorderVideos,
    setFeatured,
    retryUpload,
  } = useHighlightVideos(profile);

  const [flowPhase, setFlowPhase] = useState<ManagerFlowPhase>('list');
  const [playerVideo, setPlayerVideo] = useState<HighlightVideo | null>(null);
  const [editingVideo, setEditingVideo] = useState<HighlightVideo | null>(null);
  const [preparedUpload, setPreparedUpload] = useState<Awaited<ReturnType<typeof pickAndPrepareUpload>>>(null);

  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const { showSnackbar } = useSnackbar();
  const { t } = useAppTranslation(['common', 'media']);

  const sortedVideos = useMemo(
    () => sortHighlightVideos(library.videos).filter((video) => !pendingDeleteIds.includes(video.id)),
    [library.videos, pendingDeleteIds],
  );

  useEffect(() => {
    if (!visible) {
      setFlowPhase('list');
      setEditingVideo(null);
      setPreparedUpload(null);
    }
  }, [visible]);

  const handleStartUpload = async () => {
    try {
      setFlowPhase('picking');
      await waitForModalDismiss();

      const prepared = await pickAndPrepareUpload();
      if (!prepared) {
        setFlowPhase('list');
        return;
      }

      setPreparedUpload(prepared);
      setEditingVideo(null);
      await waitForModalDismiss();
      setFlowPhase('editing');
    } catch (error) {
      setFlowPhase('list');
      Alert.alert('Upload Error', toUserMessage(error, 'Could not pick video.'));
    }
  };

  const handleCreateSubmit = async (
    metadata: Omit<HighlightVideo, 'id' | 'videoUrl' | 'thumbnailUrl' | 'storagePath' | 'thumbnailStoragePath' | 'fileSizeBytes' | 'uploadStatus' | 'uploadError' | 'createdAt' | 'updatedAt' | 'analysis'>,
  ) => {
    try {
      if (preparedUpload) {
        await completeUpload(preparedUpload, metadata);
      }
      setPreparedUpload(null);
      setFlowPhase('list');
    } catch (error) {
      Alert.alert('Upload Error', toUserMessage(error, 'Upload failed.'));
    }
  };

  const handleEditSubmit = async (
    metadata: Omit<HighlightVideo, 'id' | 'videoUrl' | 'thumbnailUrl' | 'storagePath' | 'thumbnailStoragePath' | 'fileSizeBytes' | 'uploadStatus' | 'uploadError' | 'createdAt' | 'updatedAt' | 'analysis'>,
  ) => {
    if (!editingVideo) {
      return;
    }

    try {
      const updated: HighlightVideo = {
        ...editingVideo,
        ...metadata,
        analysis: editingVideo.analysis,
      };
      await updateVideo(updated);
      if (metadata.featured) {
        await setFeatured(editingVideo.id);
      }
      setEditingVideo(null);
      setFlowPhase('list');
    } catch (error) {
      Alert.alert('Save Error', toUserMessage(error, 'Could not save video.'));
    }
  };

  const moveVideo = async (videoId: string, direction: 'up' | 'down') => {
    const ids = sortedVideos.map((video) => video.id);
    const index = ids.indexOf(videoId);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ids.length) {
      return;
    }
    const next = [...ids];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    await reorderVideos(next);
  };

  const unhide = (videoId: string) =>
    setPendingDeleteIds((current) => current.filter((id) => id !== videoId));

  const confirmDelete = (video: HighlightVideo) => {
    setPendingDeleteIds((current) => [...current, video.id]);
    showSnackbar({
      message: t('common:removedItem', { name: video.title }),
      actionLabel: t('common:undo'),
      onAction: () => unhide(video.id),
      onTimeout: () => {
        deleteVideo(video.id)
          .catch((error: unknown) => {
            Alert.alert(t('common:errorTitle'), toUserMessage(error, t('common:removeFailed')));
          })
          .finally(() => unhide(video.id));
      },
    });
  };

  const handleRetryUpload = async (videoId: string) => {
    try {
      setFlowPhase('picking');
      await waitForModalDismiss();
      await retryUpload(videoId);
      setFlowPhase('list');
    } catch (error) {
      setFlowPhase('list');
      Alert.alert('Upload Error', toUserMessage(error, 'Could not retry upload.'));
    }
  };

  const footer = (
    <Button variant="secondary" onPress={onClose}>
      Done
    </Button>
  );

  return (
    <>
      <Modal
        visible={visible && flowPhase === 'list'}
        onClose={onClose}
        title="Highlight Videos"
        size="sheet"
        footer={footer}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4">
            <Text variant="body-sm" color="secondary">
              Choose a short clip from Photos / Gallery (up to 3 minutes). Export a trimmed moment
              from your Veo app, or pick a recording already saved on your phone.
            </Text>

            {onAnalyzeMatchVideoPress ? (
              <View className="gap-2 rounded-xl border border-border bg-background-secondary/60 px-4 py-3">
                <Text variant="body-sm" weight="semibold">
                  Full Veo match recording?
                </Text>
                <Text variant="caption" color="secondary">
                  Upload the entire match under Growth → Analyze match video for AI stats and coaching
                  feedback (up to 150 minutes).
                </Text>
                <Button variant="secondary" size="sm" onPress={onAnalyzeMatchVideoPress}>
                  Analyze full match video
                </Button>
              </View>
            ) : null}

            {onOpenHighlightReelStudio ? (
              <Button variant="secondary" onPress={onOpenHighlightReelStudio}>
                Build highlight reel from match evidence
              </Button>
            ) : null}

            <Button
              variant="accent"
              onPress={() => void handleStartUpload()}
              loading={isUploading || flowPhase === 'picking'}
              leftIcon={<Upload size={18} color={colors.surface} />}
            >
              Upload from Photos
            </Button>

            <HighlightVideoUploadProgress progress={uploadProgress} />

            {sortedVideos.length === 0 ? (
              <Text variant="body-sm" color="secondary">
                No highlight videos yet. Upload your first clip to build your reel.
              </Text>
            ) : (
              sortedVideos.map((video, index) => (
                <View key={video.id} className="gap-2 rounded-xl border border-border p-3">
                  <HighlightVideoCard video={video} index={index} onPress={setPlayerVideo} />
                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setEditingVideo(video);
                        setPreparedUpload(null);
                        setFlowPhase('editing');
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => void setFeatured(video.id)}
                    >
                      Feature
                    </Button>
                    {video.uploadStatus === 'failed' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => void handleRetryUpload(video.id)}
                      >
                        Retry
                      </Button>
                    ) : null}
                    <Button variant="secondary" size="sm" onPress={() => void moveVideo(video.id, 'up')}>
                      <ChevronUp size={16} color={colors.textPrimary} />
                    </Button>
                    <Button variant="secondary" size="sm" onPress={() => void moveVideo(video.id, 'down')}>
                      <ChevronDown size={16} color={colors.textPrimary} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      accessibilityLabel={`${t('common:delete')}: ${video.title}`}
                      onPress={() => confirmDelete(video)}
                    >
                      <Trash2 size={16} color={colors.error} />
                    </Button>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </Modal>

      <HighlightVideoEditorModal
        visible={visible && flowPhase === 'editing'}
        initialVideo={editingVideo ?? { durationSec: preparedUpload?.compressed.durationSec ?? 0 }}
        saving={isUploading}
        title={editingVideo ? t('media:editor.editTitle') : t('media:editor.addTitle')}
        onClose={() => {
          setEditingVideo(null);
          setPreparedUpload(null);
          setFlowPhase('list');
        }}
        onSubmit={(metadata) => {
          if (editingVideo) {
            void handleEditSubmit(metadata);
          } else {
            void handleCreateSubmit(metadata);
          }
        }}
      />

      <HighlightVideoPlayerModal
        visible={playerVideo !== null}
        video={playerVideo}
        onClose={() => setPlayerVideo(null)}
      />
    </>
  );
}
