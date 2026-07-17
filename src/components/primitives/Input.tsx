import { forwardRef, useState, type ReactNode } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
  inputClassName?: string;
  fieldClassName?: string;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    leftIcon,
    rightIcon,
    containerClassName,
    inputClassName,
    fieldClassName,
    editable = true,
    onFocus,
    onBlur,
    accessibilityLabel,
    ...props
  },
  ref,
) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(error);

  return (
    <View className={cn('w-full', containerClassName)}>
      {label ? (
        <Text variant="label" className="mb-1 text-foreground">
          {label}
        </Text>
      ) : null}

      <View
        className={cn(
          'min-h-12 flex-row items-center rounded-xl border bg-surface px-4',
          hasError
            ? 'border-error'
            : isFocused
              ? 'border-gold'
              : 'border-gold/30',
          !editable && 'opacity-50',
          fieldClassName,
        )}
      >
        {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}

        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled: !editable }}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          className={cn(
            'flex-1 py-3 text-body',
            inputClassName,
          )}
          style={[{ color: colors.textPrimary }, props.style]}
          {...props}
        />

        {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
      </View>

      {error ? (
        <Text variant="caption" color="error" className="mt-1" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="secondary" className="mt-1">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
