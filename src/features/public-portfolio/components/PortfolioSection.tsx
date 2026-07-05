import { type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Text } from '@/components/primitives/Text';

export type PortfolioSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  index: number;
};

export function PortfolioSection({ title, subtitle, children, index }: PortfolioSectionProps) {
  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index, 6) * 50).duration(350)}
      className="gap-3 rounded-2xl border border-border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <View>
        <Text variant="overline" color="secondary">
          Football Passport
        </Text>
        <Text weight="semibold" className="text-xl">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body-sm" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </Animated.View>
  );
}
