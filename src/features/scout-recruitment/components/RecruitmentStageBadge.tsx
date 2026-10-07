import { Badge } from '@/components/primitives/Badge';
import { RECRUITMENT_STAGE_COLORS } from '@/features/scout-recruitment/constants';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type RecruitmentStage } from '@/features/scout-recruitment/types';

export type RecruitmentStageBadgeProps = {
  stage: RecruitmentStage;
};

export function RecruitmentStageBadge({ stage }: RecruitmentStageBadgeProps) {
  const { t } = useAppTranslation('scout');
  return (
    <Badge
      label={t(`stage.${stage}`)}
      variant="outline"
      size="sm"
      className="border-0"
      style={{ backgroundColor: `${RECRUITMENT_STAGE_COLORS[stage]}22` }}
    />
  );
}
