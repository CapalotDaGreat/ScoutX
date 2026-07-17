import { View } from 'react-native';
import { BadgeCheck, Building2, ShieldCheck, UserCheck } from 'lucide-react-native';
import { Badge, type BadgeSize, type BadgeVariant } from '@/components/primitives/Badge';
import { TRUST_ENTITY_LABELS } from '@/features/trust-system/constants';
import { type TrustEntityType } from '@/features/trust-system/types';
import { useTheme } from '@/theme';

const entityVariants: Record<TrustEntityType, BadgeVariant> = {
  player: 'info',
  scout: 'accent',
  club: 'prestige',
};

const entityIcons = {
  player: UserCheck,
  scout: ShieldCheck,
  club: Building2,
} as const;

export type VerificationBadgeProps = {
  entity: TrustEntityType;
  label?: string;
  size?: BadgeSize;
  showIcon?: boolean;
};

export function VerificationBadge({
  entity,
  label,
  size = 'sm',
  showIcon = true,
}: VerificationBadgeProps) {
  const { colors } = useTheme();
  const Icon = entityIcons[entity];
  const resolvedLabel = label ?? TRUST_ENTITY_LABELS[entity];

  return (
    <View className="flex-row items-center gap-1">
      {showIcon ? (
        <Icon
          size={size === 'lg' ? 16 : 14}
          color={entity === 'club' ? colors.gold : colors.accent}
        />
      ) : (
        <BadgeCheck
          size={size === 'lg' ? 16 : 14}
          color={entity === 'club' ? colors.gold : colors.accent}
        />
      )}
      <Badge label={resolvedLabel} variant={entityVariants[entity]} size={size} />
    </View>
  );
}
