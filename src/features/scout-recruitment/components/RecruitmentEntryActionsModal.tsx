import { View, Pressable } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { RecruitmentStageBadge } from '@/features/scout-recruitment/components/RecruitmentStageBadge';
import {
  RECRUITMENT_STAGE_COLORS,
  RECRUITMENT_STAGE_LABELS,
  RECRUITMENT_STAGES,
} from '@/features/scout-recruitment/constants';
import { useRecruitment } from '@/features/scout-recruitment/context/RecruitmentProvider';
import {
  type RecruitmentEntry,
  type RecruitmentStage,
} from '@/features/scout-recruitment/types';
import { cn } from '@/utils/cn';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type RecruitmentEntryActionsModalProps = {
  visible: boolean;
  entry: RecruitmentEntry | null;
  onClose: () => void;
};

export function RecruitmentEntryActionsModal({
  visible,
  entry,
  onClose,
}: RecruitmentEntryActionsModalProps) {
  const { colors } = useTheme();
  const {
    workspace,
    movePlayerStage,
    assignFolder,
    addToShortlist,
    removeFromShortlist,
    removePlayer,
    isSaving,
  } = useRecruitment();

  if (!entry) {
    return null;
  }

  const folders = workspace?.folders ?? [];
  const shortlists = workspace?.shortlists ?? [];

  const handleMoveStage = async (stage: RecruitmentStage) => {
    if (stage === entry.stage) {
      return;
    }
    await movePlayerStage(entry.playerId, stage);
  };

  const handleAssignFolder = async (folderId: string | null) => {
    await assignFolder(entry.playerId, folderId);
  };

  const handleToggleShortlist = async (shortlistId: string, isMember: boolean) => {
    if (isMember) {
      await removeFromShortlist(shortlistId, entry.playerId);
    } else {
      await addToShortlist(shortlistId, entry.playerId);
    }
  };

  const handleRemove = async () => {
    await removePlayer(entry.playerId);
    onClose();
  };

  return (
    <Modal visible={visible} onClose={onClose} title={entry.playerName} size="lg">
      <View className="gap-5">
        <View className="gap-2">
          <Text variant="overline" color="secondary">
            Recruitment Stage
          </Text>
          <RecruitmentStageBadge stage={entry.stage} />
          <View className="gap-2">
            {RECRUITMENT_STAGES.map((stage) => {
              const isCurrent = entry.stage === stage;
              const color = RECRUITMENT_STAGE_COLORS[stage];
              return (
                <Pressable
                  key={stage}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                  disabled={isSaving}
                  onPress={() => {
                    void handleMoveStage(stage);
                  }}
                  className={cn(
                    'flex-row items-center justify-between rounded-xl border px-3 py-2.5',
                    isCurrent
                      ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
                      : 'border-border bg-surface dark:border-neutral-800 dark:bg-neutral-900',
                  )}
                >
                  <View className="flex-row items-center gap-2">
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    <Text variant="body-sm" className="font-sans-semibold">
                      {RECRUITMENT_STAGE_LABELS[stage]}
                    </Text>
                  </View>
                  {isCurrent ? <Check size={16} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <Text variant="overline" color="secondary">
            Folder
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {folders.map((folder) => {
              const isActive = entry.folderId === folder.id;
              return (
                <Pressable
                  key={folder.id}
                  accessibilityRole="button"
                  disabled={isSaving}
                  onPress={() => {
                    void handleAssignFolder(folder.id);
                  }}
                  className={cn(
                    'flex-row items-center gap-2 rounded-full border px-3 py-2',
                    isActive
                      ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
                      : 'border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900',
                  )}
                >
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: folder.color }} />
                  <Text variant="caption" className="font-sans-semibold">
                    {folder.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {shortlists.length > 0 ? (
          <View className="gap-2">
            <Text variant="overline" color="secondary">
              Shortlists
            </Text>
            {shortlists.map((shortlist) => {
              const isMember = entry.shortlistIds.includes(shortlist.id);
              return (
                <Pressable
                  key={shortlist.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isMember }}
                  disabled={isSaving}
                  onPress={() => {
                    void handleToggleShortlist(shortlist.id, isMember);
                  }}
                  className={cn(
                    'flex-row items-center justify-between rounded-xl border px-3 py-2.5',
                    isMember
                      ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
                      : 'border-border bg-surface dark:border-neutral-800 dark:bg-neutral-900',
                  )}
                >
                  <View>
                    <Text variant="body-sm" className="font-sans-semibold">
                      {shortlist.name}
                    </Text>
                    {shortlist.description ? (
                      <Text variant="caption" color="secondary">
                        {shortlist.description}
                      </Text>
                    ) : null}
                  </View>
                  {isMember ? <Check size={16} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Button variant="ghost" onPress={handleRemove} disabled={isSaving}>
          Remove from pipeline
        </Button>
      </View>
    </Modal>
  );
}
