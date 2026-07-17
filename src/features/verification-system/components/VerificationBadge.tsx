import { Badge } from '@/components/primitives/Badge';
import { type VerificationBadgeLevel } from '@/features/verification-system/types';
import { resolveVerificationBadgeLabel } from '@/features/verification-system/services/verificationService';

export type VerificationBadgeProps = {
  level: VerificationBadgeLevel;
};

export function VerificationBadge({ level }: VerificationBadgeProps) {
  const label = resolveVerificationBadgeLabel(level);
  if (!label) {
    return null;
  }

  return (
    <Badge
      label={label}
      variant={level === 'verified' ? 'prestige' : 'warning'}
      size="sm"
      className="rounded-full"
    />
  );
}
