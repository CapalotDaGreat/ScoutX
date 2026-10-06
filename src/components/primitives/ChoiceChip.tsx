import { Pressable } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

/** Single-select / multi-select pill with a 44pt touch target and selected state announced. */
export function ChoiceChip({
  label,
  selected,
  onPress,
  disabled = false,
  accessibilityHint,
  testID,
}: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      className={cn(
        'min-h-11 justify-center rounded-full border px-4',
        selected ? 'border-accent bg-accent-muted' : 'border-border bg-surface',
        disabled && 'opacity-50',
      )}
    >
      <Text weight={selected ? 'semibold' : 'regular'} color={selected ? 'accent' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}
