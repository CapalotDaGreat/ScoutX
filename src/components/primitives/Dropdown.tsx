import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { Modal } from '@/components/feedback/Modal';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';

export type DropdownOption<T extends string = string> = {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
};

export type DropdownProps<T extends string = string> = {
  label?: string;
  placeholder?: string;
  options: DropdownOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  renderOption?: (option: DropdownOption<T>, selected: boolean) => ReactNode;
};

export function Dropdown<T extends string = string>({
  label,
  placeholder = 'Select an option',
  options,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  className,
  renderOption,
}: DropdownProps<T>) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);

  const handleSelect = useCallback(
    (option: DropdownOption<T>) => {
      if (option.disabled) {
        return;
      }
      void triggerHaptic('light');
      onChange(option.value);
      setIsOpen(false);
    },
    [onChange],
  );

  return (
    <View className={cn('w-full', className)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Dropdown'}
        accessibilityState={{ disabled, expanded: isOpen }}
        accessibilityValue={{ text: selectedOption?.label ?? placeholder }}
        disabled={disabled}
        onPress={() => setIsOpen(true)}
      >
        {/* A drawn field, not a read-only TextInput: on web an <input> inside the button is a second focus stop
            and screen readers announce it as an edit field nested in a button. */}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {label ? (
            <Text variant="label" className="mb-1 text-foreground">
              {label}
            </Text>
          ) : null}
          <View
            className={cn(
              'min-h-12 flex-row items-center rounded-md border bg-surface px-4',
              error ? 'border-error' : isOpen ? 'border-accent' : 'border-border',
              disabled && 'opacity-50',
            )}
          >
            <Text
              className="min-w-0 flex-1 py-3"
              color={selectedOption ? 'primary' : 'tertiary'}
              numberOfLines={1}
            >
              {selectedOption?.label ?? placeholder ?? ''}
            </Text>
            <View className="ml-2">
              <ChevronDown size={20} color={colors.textSecondary} strokeWidth={1.75} />
            </View>
          </View>
        </View>
      </Pressable>
      {error ? <Text variant="caption" color="error" className="mt-1" accessibilityRole="alert">{error}</Text>
        : hint ? <Text variant="caption" color="secondary" className="mt-1">{hint}</Text> : null}

      <Modal
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        title={label ?? 'Select'}
        size="sheet"
      >
        <FlatList
          data={options}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => {
            const isSelected = item.value === value;

            if (renderOption) {
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => handleSelect(item)}
                >
                  {renderOption(item, isSelected)}
                </Pressable>
              );
            }

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: item.disabled }}
                disabled={item.disabled}
                onPress={() => handleSelect(item)}
                className={cn(
                  'flex-row items-center justify-between border-b border-divider px-4 py-4',
                  item.disabled && 'opacity-40',
                  isSelected && 'bg-background-secondary',
                )}
              >
                <View className="flex-1 pr-3">
                  <Text
                    variant="body"
                    className={cn(
                      isSelected && 'font-sans-semibold text-accent',
                    )}
                  >
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text variant="caption" color="secondary" className="mt-0.5">
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? (
                  <Check size={20} color={colors.accent} strokeWidth={2} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </Modal>
    </View>
  );
}
