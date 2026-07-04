import { Badge } from '@/components/primitives/Badge';
import { TRIAL_STATUS_META } from '@/features/trial-invitations/constants';
import { type TrialStatus } from '@/features/trial-invitations/types';

export type TrialStatusBadgeProps = {
  status: TrialStatus;
};

export function TrialStatusBadge({ status }: TrialStatusBadgeProps) {
  const meta = TRIAL_STATUS_META[status];
  return <Badge label={meta.label} variant={meta.variant} size="sm" />;
}
