import { memo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { RecruitmentStageBadge } from '@/features/scout-recruitment/components/RecruitmentStageBadge';
import { type RecruitmentEntry } from '@/features/scout-recruitment/types';
import { MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type RecruitmentPipelineCardProps = {
  entry: RecruitmentEntry;
  onPress?: (entry: RecruitmentEntry) => void;
  onMovePress?: (entry: RecruitmentEntry) => void;
};

export const RecruitmentPipelineCard = memo(function RecruitmentPipelineCard({
  entry,
  onPress,
  onMovePress,
}: RecruitmentPipelineCardProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = entry.playerAvatarUrl.trim().length > 0 && !avatarFailed;
  const initials = entry.playerName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.playerName}, ${entry.playerClub}`}
      testID={`recruitment-card-${entry.playerId}`}
      onPress={() => onPress?.(entry)}
      className="mb-2 overflow-hidden rounded-lg border border-border bg-surface"
    >
      <View className="flex-row">
        <View className="flex-1 p-3">
          <View className="flex-row items-start gap-2.5">
            {showAvatar ? (
              <Image
                source={{ uri: entry.playerAvatarUrl }}
                className="h-10 w-10 rounded-full"
                onError={() => setAvatarFailed(true)}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View
                className="h-10 w-10 items-center justify-center rounded-full bg-background-secondary"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text variant="caption" weight="bold" color="secondary">
                  {initials || '?'}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text weight="semibold" numberOfLines={1}>
                {entry.playerName}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {entry.playerClub}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {entry.playerPosition}
              </Text>
            </View>
            {onMovePress ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pipelineUi.move', { name: entry.playerName })}
                hitSlop={6}
                onPress={(event) => {
                  event.stopPropagation();
                  onMovePress(entry);
                }}
                className="h-9 w-9 items-center justify-center rounded-md bg-background-secondary"
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
              {t('pipelineUi.shortlistCount', { count: entry.shortlistIds.length })}
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
