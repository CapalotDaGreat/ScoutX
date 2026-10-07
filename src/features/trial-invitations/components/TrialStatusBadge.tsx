import { Badge } from '@/components/primitives/Badge';
import { TRIAL_STATUS_META } from '@/features/trial-invitations/constants';
import { type TrialStatus } from '@/features/trial-invitations/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type TrialStatusBadgeProps = {
  status: TrialStatus;
};

export function TrialStatusBadge({ status }: TrialStatusBadgeProps) {
  const { t } = useAppTranslation('trials');
  const meta = TRIAL_STATUS_META[status];
  return <Badge label={t(`status.${status}`)} variant={meta.variant} size="sm" />;
}
