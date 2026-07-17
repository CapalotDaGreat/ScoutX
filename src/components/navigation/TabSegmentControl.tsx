import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

export type TabSegmentOption<T extends string> = {
  id: T;
  label: string;
};

export type TabSegmentControlProps<T extends string> = {
  segments: Array<TabSegmentOption<T>>;
  activeSegment: T;
  onSegmentChange: (segment: T) => void;
  testID?: string;
};

export function TabSegmentControl<T extends string>({
  segments,
  activeSegment,
  onSegmentChange,
  testID,
}: TabSegmentControlProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      className="mx-5 mb-4 flex-row rounded-2xl border border-gold/30 bg-gold-muted/40 p-1.5"
      style={{ backgroundColor: `${colors.goldMuted}66` }}
    >
      {segments.map((segment) => {
        const isActive = segment.id === activeSegment;
        return (
          <Pressable
            key={segment.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              void triggerHaptic('light');
              onSegmentChange(segment.id);
            }}
            className={cn(
              'min-h-[44px] flex-1 items-center justify-center rounded-xl px-3 py-2.5',
              isActive && 'bg-gold',
            )}
            style={isActive ? { backgroundColor: colors.gold } : undefined}
          >
            <Text
              variant="label"
              weight={isActive ? 'semibold' : 'medium'}
              color={isActive ? 'onGold' : 'secondary'}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
