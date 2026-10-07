import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';

export type CheckboxRowProps = {
  checked: boolean;
  label: string;
  onToggle: () => void;
  testID?: string;
};

export function CheckboxRow({ checked, label, onToggle, testID }: CheckboxRowProps) {
  return (
    <Pressable
      className="flex-row items-start gap-3"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      testID={testID}
    >
      <View className={`mt-1 h-5 w-5 rounded border ${checked ? 'border-accent bg-accent' : 'border-border'}`} />
      <Text variant="body-sm" className="flex-1">
        {label}
      </Text>
    </Pressable>
  );
}
