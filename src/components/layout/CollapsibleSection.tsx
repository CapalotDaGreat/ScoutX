import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';

export type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
  className,
}: CollapsibleSectionProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const accessibilityLabel = subtitle
    ? `${title}. ${subtitle}. ${open ? 'Expanded' : 'Collapsed'}`
    : `${title}. ${open ? 'Expanded' : 'Collapsed'}`;

  return (
    <View
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-surface',
        className,
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Double tap to expand or collapse this section"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          void triggerHaptic('light');
          setOpen((current) => !current);
        }}
        className="flex-row items-center justify-between gap-3 px-4 py-4"
      >
        <View className="flex-1">
          <Text weight="semibold">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color="secondary" className="mt-1">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {open ? (
          <ChevronUp size={18} color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
        ) : (
          <ChevronDown size={18} color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
        )}
      </Pressable>
      {open ? <View className="gap-4 border-t border-divider px-4 pb-4 pt-3">{children}</View> : null}
    </View>
  );
}
