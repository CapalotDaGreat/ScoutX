import { Badge } from '@/components/primitives/Badge';
import {
  RECRUITMENT_STAGE_COLORS,
  RECRUITMENT_STAGE_LABELS,
} from '@/features/scout-recruitment/constants';
import { type RecruitmentStage } from '@/features/scout-recruitment/types';

export type RecruitmentStageBadgeProps = {
  stage: RecruitmentStage;
};

export function RecruitmentStageBadge({ stage }: RecruitmentStageBadgeProps) {
  return (
    <Badge
      label={RECRUITMENT_STAGE_LABELS[stage]}
      variant="outline"
      size="sm"
      className="border-0"
      style={{ backgroundColor: `${RECRUITMENT_STAGE_COLORS[stage]}22` }}
    />
  );
}
