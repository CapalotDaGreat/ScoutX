import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
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
  return (
    <View
      testID={testID}
      className="mx-4 mb-3 flex-row rounded-xl border border-border bg-surface p-1"
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
              'min-h-[40px] flex-1 items-center justify-center rounded-lg px-3 py-2',
              isActive && 'bg-accent',
            )}
          >
            <Text
              variant="label"
              weight="semibold"
              className={cn(
                isActive ? 'text-accent-foreground' : 'text-foreground-secondary',
              )}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
