import { Pressable, View } from 'react-native';
import { CheckCircle2, Shield, UserRound } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type SelectableAuthRole = 'player' | 'scout';

export type RoleOptionProps = {
  role: SelectableAuthRole;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

type RoleMeta = {
  title: string;
  description: string;
  icon: typeof UserRound;
};

const roleMeta: Record<SelectableAuthRole, RoleMeta> = {
  player: {
    title: 'Player',
    description: 'Create a profile, showcase your stats, and connect with scouts.',
    icon: UserRound,
  },
  scout: {
    title: 'Scout',
    description: 'Discover talent, compare players, manage your pipeline, and send trials.',
    icon: Shield,
  },
};

export function RoleOption({ role, selected = false, ...props }: RoleOptionProps) {
  const { colors } = useTheme();
  const meta = roleMeta[role];
  const Icon = meta.icon;

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
              {meta.title}
            </Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              {meta.description}
            </Text>
          </View>
        </View>
        {selected ? <CheckCircle2 size={20} color={colors.gold} strokeWidth={2} /> : null}
      </View>
    </Pressable>
  );
}
