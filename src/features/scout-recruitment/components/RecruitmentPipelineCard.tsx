import { memo } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { RecruitmentStageBadge } from '@/features/scout-recruitment/components/RecruitmentStageBadge';
import { type RecruitmentEntry } from '@/features/scout-recruitment/types';
import { GripVertical, MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type RecruitmentPipelineCardProps = {
  entry: RecruitmentEntry;
  onPress?: (entry: RecruitmentEntry) => void;
  onMovePress?: (entry: RecruitmentEntry) => void;
};

/**
 * Pipeline card with drag-handle affordance for future drag-and-drop.
 * dragMetadata is exposed via testID/accessibility for upcoming DnD wiring.
 */
export const RecruitmentPipelineCard = memo(function RecruitmentPipelineCard({
  entry,
  onPress,
  onMovePress,
}: RecruitmentPipelineCardProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.playerName}, ${entry.playerClub}`}
      accessibilityHint="Drag handle prepared for future reordering"
      testID={`recruitment-card-${entry.playerId}`}
      onPress={() => onPress?.(entry)}
      className="mb-2 overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <View className="flex-row">
        <View
          accessibilityLabel="Drag handle"
          testID={`recruitment-drag-handle-${entry.playerId}`}
          className="items-center justify-center border-r border-divider px-1.5 py-3"
        >
          <GripVertical size={14} color={colors.textSecondary} />
        </View>

        <View className="flex-1 p-3">
          <View className="flex-row items-start gap-2.5">
            <Image source={{ uri: entry.playerAvatarUrl }} className="h-10 w-10 rounded-full" />
            <View className="flex-1">
              <Text weight="semibold" numberOfLines={1}>
                {entry.playerName}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {entry.playerClub}
              </Text>
              <Text variant="caption" color="secondary">
                {entry.playerPosition} · OVR {entry.playerOverallRating}
              </Text>
            </View>
            {onMovePress ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${entry.playerName}`}
                onPress={() => onMovePress(entry)}
                className="h-8 w-8 items-center justify-center rounded-full bg-background-secondary"
              >
                <MoreHorizontal size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {entry.notes ? (
            <Text variant="caption" color="secondary" className="mt-2" numberOfLines={2}>
              {entry.notes}
            </Text>
          ) : null}

          {entry.shortlistIds.length > 0 ? (
            <Text variant="caption" color="secondary" className="mt-1">
              {entry.shortlistIds.length} shortlist{entry.shortlistIds.length === 1 ? '' : 's'}
            </Text>
          ) : null}

          <View className="mt-2">
            <RecruitmentStageBadge stage={entry.stage} />
          </View>
        </View>
      </View>
    </Pressable>
  );
});
