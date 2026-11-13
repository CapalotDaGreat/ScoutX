import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

/** In-memory expand state for the current app session (not persisted to disk). */
const sessionExpandState = new Map<string, boolean>();

export type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** When this value changes, the section opens (onboarding / deep-link focus). */
  forceOpenKey?: number | string | null;
  /**
   * When set, remembers expand/collapse for this key during the app session
   * so scrolling away and back keeps the user's preference.
   */
  persistKey?: string;
  className?: string;
};

export function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
  forceOpenKey = null,
  persistKey,
  className,
}: CollapsibleSectionProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('common');
  const initialOpen =
    persistKey != null && sessionExpandState.has(persistKey)
      ? Boolean(sessionExpandState.get(persistKey))
      : defaultOpen;
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    if (forceOpenKey != null) {
      setOpen(true);
      if (persistKey) {
        sessionExpandState.set(persistKey, true);
      }
    }
  }, [forceOpenKey, persistKey]);

  const toggle = () => {
    void triggerHaptic('light');
    setOpen((current) => {
      const next = !current;
      if (persistKey) {
        sessionExpandState.set(persistKey, next);
      }
      return next;
    });
  };

  const accessibilityLabel = subtitle
    ? `${title}. ${subtitle}. ${open ? 'Expanded' : 'Collapsed'}`
    : `${title}. ${open ? 'Expanded' : 'Collapsed'}`;

  return (
    <View className={cn('overflow-hidden rounded-xl border border-divider bg-surface', className)}>
      <View className="flex-row">
        <View className="min-w-0 flex-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={t(open ? 'a11y.collapseSection' : 'a11y.expandSection')}
            accessibilityState={{ expanded: open }}
            onPress={toggle}
            className="min-h-[56px] flex-row items-center justify-between gap-3 px-4 py-4 active:opacity-70"
          >
            <View className="min-w-0 flex-1">
              <Text weight="semibold">{title}</Text>
              {subtitle ? (
                <Text variant="caption" color="secondary" className="mt-1">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              className={cn('h-8 w-8 items-center justify-center rounded-full', open ? 'bg-accent-muted' : 'bg-background-secondary')}
            >
              {open ? (
                <ChevronUp size={18} color={colors.accent} />
              ) : (
                <ChevronDown size={18} color={colors.textSecondary} />
              )}
            </View>
          </Pressable>
          {open ? (
            <View className="gap-4 border-t border-divider px-4 pb-4 pt-4">{children}</View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
