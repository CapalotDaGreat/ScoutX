import { ScrollView } from 'react-native';
import { RecruitmentStageColumn } from '@/features/scout-recruitment/components/RecruitmentStageColumn';
import { RECRUITMENT_STAGES } from '@/features/scout-recruitment/constants';
import { type RecruitmentEntry, type RecruitmentStage } from '@/features/scout-recruitment/types';

export type RecruitmentPipelineBoardProps = {
  entriesByStage: Record<RecruitmentStage, RecruitmentEntry[]>;
  onCardPress?: (entry: RecruitmentEntry) => void;
  onMovePress?: (entry: RecruitmentEntry) => void;
};

export function RecruitmentPipelineBoard({
  entriesByStage,
  onCardPress,
  onMovePress,
}: RecruitmentPipelineBoardProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
      testID="recruitment-pipeline-board"
    >
      {RECRUITMENT_STAGES.map((stage) => (
        <RecruitmentStageColumn
          key={stage}
          stage={stage}
          entries={entriesByStage[stage]}
          onCardPress={onCardPress}
          onMovePress={onMovePress}
        />
      ))}
    </ScrollView>
  );
}
