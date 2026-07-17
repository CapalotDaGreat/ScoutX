import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Settings } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { triggerHaptic } from '@/utils/haptics';

export type HeaderIconButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
  icon?: 'settings';
};

/** Consistent 44pt circular header action used next to Activity bell. */
export function HeaderIconButton({
  onPress,
  accessibilityLabel,
  icon = 'settings',
}: HeaderIconButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      onPress={() => {
        void triggerHaptic('light');
        onPress();
      }}
      className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface"
      style={({ pressed }) =>
        pressed ? { opacity: 0.75, transform: [{ scale: 0.96 }] } : undefined
      }
    >
      {icon === 'settings' ? (
        <Settings size={20} color={colors.textPrimary} strokeWidth={2} />
      ) : null}
    </Pressable>
  );
}

export function HeaderActionCluster({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2.5 overflow-visible">{children}</View>
  );
}
