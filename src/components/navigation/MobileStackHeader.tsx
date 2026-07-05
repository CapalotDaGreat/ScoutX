import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';

export type MobileStackHeaderProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAction?: ReactNode;
};

export function MobileStackHeader({ title, subtitle, onBack, rightAction }: MobileStackHeaderProps) {
  const { colors } = useTheme();

  return (
    <View className="flex-row items-center gap-2 px-4 pb-3 pt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        className="h-10 w-10 items-center justify-center rounded-full bg-background-secondary dark:bg-neutral-900"
      >
        <ChevronLeft size={20} color={colors.textPrimary} />
      </Pressable>
      <View className="flex-1">
        <Heading level={3}>{title}</Heading>
        {subtitle ? (
          <Text variant="caption" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightAction ? <View>{rightAction}</View> : null}
    </View>
  );
}
