import { View } from 'react-native';
import { BadgeCheck, Building2, ClipboardList, ShieldCheck, UserCheck } from 'lucide-react-native';
import { Badge, type BadgeSize, type BadgeVariant } from '@/components/primitives/Badge';
import { type TrustEntityType } from '@/features/trust-system/types';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const entityVariants: Record<TrustEntityType, BadgeVariant> = {
  player: 'info',
  scout: 'accent',
  club: 'prestige',
  coach: 'success',
};

const entityIcons = {
  player: UserCheck,
  scout: ShieldCheck,
  club: Building2,
  coach: ClipboardList,
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
  const { t } = useAppTranslation('trust');
  const Icon = entityIcons[entity];
  const resolvedLabel = label ?? t(`entity.${entity}`);

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
