import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@/utils/cn';

export type FormActionsProps = ViewProps & {
  children: ReactNode;
};

export function FormActions({ children, className, ...props }: FormActionsProps) {
  return (
    <View className={cn('w-full gap-3', className)} {...props}>
      {children}
    </View>
  );
}
