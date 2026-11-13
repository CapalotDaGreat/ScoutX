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
      className="mx-5 mb-4 flex-row rounded-full bg-background-secondary p-1"
      style={{ backgroundColor: colors.backgroundSecondary }}
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
              'min-h-[44px] flex-1 items-center justify-center rounded-full px-3 py-2.5',
              isActive && 'bg-surface',
            )}
            style={isActive ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border } : { borderWidth: 1, borderColor: 'transparent' }}
          >
            <Text
              variant="label"
              weight={isActive ? 'semibold' : 'medium'}
              color={isActive ? 'primary' : 'secondary'}
              className="text-center"
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
