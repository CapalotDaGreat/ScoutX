import { ScrollView, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { RecruitmentPipelineCard } from '@/features/scout-recruitment/components/RecruitmentPipelineCard';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type RecruitmentEntry, type RecruitmentStage } from '@/features/scout-recruitment/types';
import { useCompactLayout } from '@/hooks/useCompactLayout';

export type RecruitmentStageColumnProps = {
  stage: RecruitmentStage;
  entries: RecruitmentEntry[];
  onCardPress?: (entry: RecruitmentEntry) => void;
  onMovePress?: (entry: RecruitmentEntry) => void;
};

export function RecruitmentStageColumn({
  stage,
  entries,
  onCardPress,
  onMovePress,
}: RecruitmentStageColumnProps) {
  const { t } = useAppTranslation('scout');
  const { colors } = useTheme();
  const color = colors.accent;
  const { pipelineColumnWidth } = useCompactLayout();

  return (
    <View
      className="mr-3 border-r border-divider"
      style={{ width: pipelineColumnWidth }}
      testID={`recruitment-column-${stage}`}
    >
      <View className="border-b border-divider px-3 py-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <Text weight="semibold">{t(`stage.${stage}`)}</Text>
          </View>
          <View
            className="min-w-[24px] rounded-full px-2 py-0.5"
            style={{ backgroundColor: colors.backgroundSecondary }}
          >
            <Text variant="caption" className="text-center font-sans-bold" color="secondary">
              {entries.length}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="max-h-[420px] px-2 py-2"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {entries.length === 0 ? (
          <View className="items-center px-3 py-8">
            <Text variant="caption" color="secondary" className="text-center">
              {t('pipelineUi.emptyStage')}
            </Text>
          </View>
        ) : (
          entries.map((entry) => (
            <RecruitmentPipelineCard
              key={entry.id}
              entry={entry}
              onPress={onCardPress}
              onMovePress={onMovePress}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
