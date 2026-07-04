import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { CreateRecruitmentFolderModal } from '@/features/scout-recruitment/components/CreateRecruitmentFolderModal';
import { CreateRecruitmentShortlistModal } from '@/features/scout-recruitment/components/CreateRecruitmentShortlistModal';
import { RecruitmentEntryActionsModal } from '@/features/scout-recruitment/components/RecruitmentEntryActionsModal';
import { RecruitmentFolderBar } from '@/features/scout-recruitment/components/RecruitmentFolderBar';
import { RecruitmentPipelineBoard } from '@/features/scout-recruitment/components/RecruitmentPipelineBoard';
import { RecruitmentShortlistBar } from '@/features/scout-recruitment/components/RecruitmentShortlistBar';
import { groupEntriesByStage } from '@/features/scout-recruitment/models/RecruitmentModel';
import { useRecruitment } from '@/features/scout-recruitment/context/RecruitmentProvider';
import { type RecruitmentEntry } from '@/features/scout-recruitment/types';
import { Kanban } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type RecruitmentPipelineScreenProps = {
  onDiscoverPress?: () => void;
  onPlayerPress?: (playerId: string) => void;
};

export function RecruitmentPipelineScreen({
  onDiscoverPress,
  onPlayerPress,
}: RecruitmentPipelineScreenProps) {
  const { colors } = useTheme();
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
      <SafeAreaView className="flex-1 bg-background px-4 pt-4 dark:bg-neutral-950">
        <SkeletonLoader variant="card" count={3} />
      </SafeAreaView>
    );
  }

  const totalPlayers = workspace?.entries.length ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-neutral-950" edges={['top']}>
      <View className="border-b border-divider px-4 pb-4 pt-4 dark:border-neutral-800">
        <View className="flex-row items-center gap-2">
          <Kanban size={22} color={colors.accent} />
          <View className="flex-1">
            <Heading level={2}>Recruitment Pipeline</Heading>
            <Text variant="body-sm" color="secondary" className="mt-1">
              {totalPlayers} saved player{totalPlayers === 1 ? '' : 's'} across{' '}
              {workspace?.folders.length ?? 0} folders and {workspace?.shortlists.length ?? 0}{' '}
              shortlists
            </Text>
          </View>
        </View>
      </View>

      {totalPlayers === 0 ? (
        <EmptyState
          title="Your pipeline is empty"
          description="Save players from Discover to start tracking them through recruitment stages."
          actionLabel={onDiscoverPress ? 'Discover Players' : undefined}
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

          <RecruitmentPipelineBoard
            entriesByStage={filteredEntriesByStage}
            onCardPress={(entry) => onPlayerPress?.(entry.playerId)}
            onMovePress={setActiveEntry}
          />
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
    </SafeAreaView>
  );
}
