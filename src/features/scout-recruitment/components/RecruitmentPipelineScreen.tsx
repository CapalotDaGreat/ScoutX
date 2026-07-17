import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppSafeAreaView } from '@/components/layout/AppSafeAreaView';
import { Kanban, LayoutList } from 'lucide-react-native';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { HeaderIconButton } from '@/components/navigation/HeaderIconButton';
import { CreateRecruitmentFolderModal } from '@/features/scout-recruitment/components/CreateRecruitmentFolderModal';
import { CreateRecruitmentShortlistModal } from '@/features/scout-recruitment/components/CreateRecruitmentShortlistModal';
import { RecruitmentEntryActionsModal } from '@/features/scout-recruitment/components/RecruitmentEntryActionsModal';
import { RecruitmentFolderBar } from '@/features/scout-recruitment/components/RecruitmentFolderBar';
import { RecruitmentPipelineBoard } from '@/features/scout-recruitment/components/RecruitmentPipelineBoard';
import { RecruitmentPipelineListView } from '@/features/scout-recruitment/components/RecruitmentPipelineListView';
import { RecruitmentShortlistBar } from '@/features/scout-recruitment/components/RecruitmentShortlistBar';
import { groupEntriesByStage } from '@/features/scout-recruitment/models/RecruitmentModel';
import { useRecruitment } from '@/features/scout-recruitment/context/RecruitmentProvider';
import { type RecruitmentEntry } from '@/features/scout-recruitment/types';
import { useCompactLayout } from '@/hooks/useCompactLayout';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type PipelineViewMode = 'kanban' | 'list';

export type RecruitmentPipelineScreenProps = {
  onDiscoverPress?: () => void;
  onPlayerPress?: (playerId: string) => void;
  onSettingsPress?: () => void;
};

export function RecruitmentPipelineScreen({
  onDiscoverPress,
  onPlayerPress,
  onSettingsPress,
}: RecruitmentPipelineScreenProps) {
  const { t } = useAppTranslation(['scout', 'common', 'errors']);
  const { colors } = useTheme();
  const { isCompact, isTablet } = useCompactLayout();
  const {
    isReady,
    workspace,
    createFolder,
    createShortlist,
  } = useRecruitment();
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeShortlistId, setActiveShortlistId] = useState<string | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [shortlistModalVisible, setShortlistModalVisible] = useState(false);
  const [activeEntry, setActiveEntry] = useState<RecruitmentEntry | null>(null);
  const [viewMode, setViewMode] = useState<PipelineViewMode>(isTablet ? 'kanban' : 'list');

  const filteredEntriesByStage = useMemo(() => {
    const entries = workspace?.entries ?? [];
    const filtered = entries.filter((entry) => {
      const folderMatch = activeFolderId === null || entry.folderId === activeFolderId;
      const shortlistMatch =
        activeShortlistId === null || entry.shortlistIds.includes(activeShortlistId);
      return folderMatch && shortlistMatch;
    });
    return groupEntriesByStage(filtered);
  }, [activeFolderId, activeShortlistId, workspace?.entries]);

  if (!isReady) {
    return (
      <AppSafeAreaView className="flex-1 bg-background px-4 pt-4">
        <SkeletonLoader variant="card" count={3} />
      </AppSafeAreaView>
    );
  }

  const totalPlayers = workspace?.entries.length ?? 0;

  return (
    <AppSafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="border-b border-divider px-4 pb-4 pt-4">
        <View className="flex-row items-center gap-2">
          <Kanban size={22} color={colors.accent} />
          <View className="min-w-0 flex-1">
            <Heading level={2}>{t('scout:pipeline.title')}</Heading>
            <Text variant="body-sm" color="secondary" className="mt-1">
              {t('scout:pipeline.savedPlayersSummary', {
                count: totalPlayers,
                folders: workspace?.folders.length ?? 0,
                shortlists: workspace?.shortlists.length ?? 0,
              })}
            </Text>
          </View>
          {onSettingsPress ? (
            <View className="shrink-0">
              <HeaderIconButton
                accessibilityLabel={t('common:settings')}
                onPress={onSettingsPress}
              />
            </View>
          ) : null}
        </View>
        {isCompact ? (
          <View className="mt-3 flex-row gap-2">
            <Button
              variant={viewMode === 'list' ? 'accent' : 'secondary'}
              size="sm"
              className="flex-1"
              leftIcon={<LayoutList size={16} color={viewMode === 'list' ? colors.accentForeground : colors.textPrimary} />}
              onPress={() => setViewMode('list')}
            >
              {t('scout:pipeline.list')}
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'accent' : 'secondary'}
              size="sm"
              className="flex-1"
              leftIcon={<Kanban size={16} color={viewMode === 'kanban' ? colors.accentForeground : colors.textPrimary} />}
              onPress={() => setViewMode('kanban')}
            >
              {t('scout:pipeline.board')}
            </Button>
          </View>
        ) : null}
      </View>

      {totalPlayers === 0 ? (
        <EmptyState
          title={t('scout:pipeline.emptyTitle')}
          description={t('scout:pipeline.emptyActionDescription')}
          actionLabel={onDiscoverPress ? t('scout:pipeline.discoverPlayers') : undefined}
          onAction={onDiscoverPress}
        />
      ) : (
        <View className="flex-1 gap-4 py-4">
          <RecruitmentFolderBar
            folders={workspace?.folders ?? []}
            activeFolderId={activeFolderId}
            onSelectFolder={setActiveFolderId}
            onCreateFolder={() => setFolderModalVisible(true)}
          />

          <RecruitmentShortlistBar
            shortlists={workspace?.shortlists ?? []}
            activeShortlistId={activeShortlistId}
            onSelectShortlist={setActiveShortlistId}
            onCreateShortlist={() => setShortlistModalVisible(true)}
          />

          {viewMode === 'kanban' ? (
            <RecruitmentPipelineBoard
              entriesByStage={filteredEntriesByStage}
              onCardPress={(entry) => onPlayerPress?.(entry.playerId)}
              onMovePress={setActiveEntry}
            />
          ) : (
            <RecruitmentPipelineListView
              entriesByStage={filteredEntriesByStage}
              onCardPress={(entry) => onPlayerPress?.(entry.playerId)}
              onMovePress={setActiveEntry}
            />
          )}
        </View>
      )}

      <CreateRecruitmentFolderModal
        visible={folderModalVisible}
        onClose={() => setFolderModalVisible(false)}
        onCreate={createFolder}
      />

      <CreateRecruitmentShortlistModal
        visible={shortlistModalVisible}
        folders={workspace?.folders ?? []}
        onClose={() => setShortlistModalVisible(false)}
        onCreate={createShortlist}
      />

      <RecruitmentEntryActionsModal
        visible={activeEntry !== null}
        entry={activeEntry}
        onClose={() => setActiveEntry(null)}
      />
    </AppSafeAreaView>
  );
}
