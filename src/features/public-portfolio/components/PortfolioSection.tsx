import { type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Text } from '@/components/primitives/Text';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PortfolioSectionProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  index: number;
};

export function PortfolioSection({ title, subtitle, children, index }: PortfolioSectionProps) {
  const { t } = useAppTranslation('portfolio');
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.delay(Math.min(index, 6) * 50).duration(350)}
      className="gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <View>
        <Text variant="overline" color="secondary">
          {t('footballPassport')}
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
