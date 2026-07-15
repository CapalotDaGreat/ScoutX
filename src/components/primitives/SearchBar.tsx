import { forwardRef } from 'react';
import { Pressable, type TextInput } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { Input, type InputProps } from '@/components/primitives/Input';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type SearchBarProps = Omit<InputProps, 'leftIcon' | 'rightIcon'> & {
  onClear?: () => void;
  showClearButton?: boolean;
};

export const SearchBar = forwardRef<TextInput, SearchBarProps>(function SearchBar(
  {
    value,
    onClear,
    showClearButton = true,
    placeholder = 'Search',
    containerClassName,
    inputClassName,
    ...props
  },
  ref,
) {
  const { colors } = useTheme();
  const hasValue = Boolean(value && String(value).length > 0);

  return (
    <Input
      ref={ref}
      value={value}
      placeholder={placeholder}
      returnKeyType="search"
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="never"
      accessibilityRole="search"
      containerClassName={containerClassName}
      fieldClassName="rounded-full"
      inputClassName={cn('py-2.5', inputClassName)}
      leftIcon={<Search size={20} color={colors.textSecondary} strokeWidth={1.75} />}
      rightIcon={
        showClearButton && hasValue ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={onClear}
            className="h-6 w-6 items-center justify-center rounded-full bg-background-secondary"
          >
            <X size={14} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        ) : undefined
      }
      {...props}
    />
  );
});
