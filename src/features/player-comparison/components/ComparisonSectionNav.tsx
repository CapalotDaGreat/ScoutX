import { ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_SECTION_LABELS } from '@/features/player-comparison/constants';
import { type ComparisonSectionKey } from '@/features/player-comparison/types';
import { cn } from '@/utils/cn';

export type ComparisonSectionNavProps = {
  activeSection: ComparisonSectionKey;
  onSectionChange: (section: ComparisonSectionKey) => void;
  layout?: 'horizontal' | 'vertical';
  sections?: ComparisonSectionKey[];
};

export function ComparisonSectionNav({
  activeSection,
  onSectionChange,
  layout = 'horizontal',
  sections: sectionKeys,
}: ComparisonSectionNavProps) {
  const isVertical = layout === 'vertical';
  const sections = (sectionKeys ?? (Object.keys(COMPARISON_SECTION_LABELS) as ComparisonSectionKey[])).map(
    (key) => [key, COMPARISON_SECTION_LABELS[key]] as const,
  );

  return (
    <ScrollView
      horizontal={!isVertical}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={
        isVertical ? { gap: 8, paddingVertical: 4 } : { gap: 8, paddingHorizontal: 4 }
      }
    >
      {sections.map(([key, label]) => {
        const isActive = activeSection === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onSectionChange(key)}
            className={cn(
              isVertical ? 'rounded-xl border px-3 py-3' : 'rounded-full border px-3 py-2',
              isActive
                ? 'border-accent bg-accent-muted'
                : 'border-border bg-surface',
            )}
          >
            <Text
              variant="caption"
              className={cn(
                'font-sans-semibold',
                isActive ? 'text-accent' : 'text-foreground-secondary',
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
