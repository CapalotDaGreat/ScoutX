import { View } from 'react-native';
import { ScrollView } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { RecruitmentPipelineCard } from '@/features/scout-recruitment/components/RecruitmentPipelineCard';
import {
  RECRUITMENT_STAGE_COLORS,
  RECRUITMENT_STAGE_LABELS,
  RECRUITMENT_STAGES,
} from '@/features/scout-recruitment/constants';
import { type RecruitmentEntry, type RecruitmentStage } from '@/features/scout-recruitment/types';

export type RecruitmentPipelineListViewProps = {
  entriesByStage: Record<RecruitmentStage, RecruitmentEntry[]>;
  onCardPress?: (entry: RecruitmentEntry) => void;
  onMovePress?: (entry: RecruitmentEntry) => void;
};

export function RecruitmentPipelineListView({
  entriesByStage,
  onCardPress,
  onMovePress,
}: RecruitmentPipelineListViewProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
    >
      {RECRUITMENT_STAGES.map((stage) => {
        const entries = entriesByStage[stage];
        const color = RECRUITMENT_STAGE_COLORS[stage];

        return (
          <View key={stage} className="mb-5">
            <View className="mb-2 flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <Text weight="semibold">{RECRUITMENT_STAGE_LABELS[stage]}</Text>
              <Text variant="caption" color="secondary">
                ({entries.length})
              </Text>
            </View>
            {entries.length === 0 ? (
              <Text variant="body-sm" color="secondary" className="px-1 py-2">
                No players in this stage.
              </Text>
            ) : (
              <View className="gap-2">
                {entries.map((entry) => (
                  <RecruitmentPipelineCard
                    key={entry.id}
                    entry={entry}
                    onPress={onCardPress}
                    onMovePress={onMovePress}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
