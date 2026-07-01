import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Input, type InputProps } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type FormFieldProps = Omit<InputProps, 'containerClassName'> & {
  label?: string;
  hint?: string;
  error?: string;
  info?: ReactNode;
  containerClassName?: string;
};

export function FormField({
  label,
  hint,
  error,
  info,
  containerClassName,
  className,
  ...props
}: FormFieldProps) {
  return (
    <View className={cn('w-full', containerClassName)}>
      {label ? (
        <View className="mb-1 flex-row items-center justify-between gap-2">
          <Text variant="label" className="text-foreground dark:text-white">
            {label}
          </Text>
          {info ? <View>{info}</View> : null}
        </View>
      ) : null}

      <Input
        {...props}
        error={error}
        hint={hint}
        className={className}
      />
    </View>
  );
}
