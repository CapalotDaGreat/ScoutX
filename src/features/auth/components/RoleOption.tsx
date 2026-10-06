import { Pressable, View } from 'react-native';
import { CheckCircle2, ClipboardList, Shield, UserRound } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type SelectableAuthRole = 'player' | 'scout' | 'coach';

export type RoleOptionProps = {
  role: SelectableAuthRole;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

const roleIcons = {
  player: UserRound,
  scout: Shield,
  coach: ClipboardList,
} as const;

export function RoleOption({ role, selected = false, ...props }: RoleOptionProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['auth']);
  const Icon = roleIcons[role];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn(
        'w-full rounded-xl border px-4 py-4',
        selected
          ? 'border-gold bg-gold-muted'
          : 'border-gold/25 bg-surface',
      )}
      {...props}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row items-start gap-3">
          <View className="mt-0.5 rounded-full bg-background-secondary p-2">
            <Icon size={18} color={selected ? colors.gold : colors.textSecondary} strokeWidth={1.75} />
          </View>
          <View className="flex-1">
            <Text variant="label" className={cn(selected ? 'text-gold' : 'text-foreground')}>
              {t(`auth:roleSelection.${role}Title`)}
            </Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              {t(`auth:roleSelection.${role}Description`)}
            </Text>
          </View>
        </View>
        {selected ? <CheckCircle2 size={20} color={colors.gold} strokeWidth={2} /> : null}
      </View>
    </Pressable>
  );
}
