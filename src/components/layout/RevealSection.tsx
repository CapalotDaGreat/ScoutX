import Animated, { FadeInDown } from 'react-native-reanimated';
import { type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export const REVEAL_DURATION_MS = 350;
export const REVEAL_BASE_DELAY_MS = 60;
export const REVEAL_STAGGER_MS = 40;

export function staggeredFadeIn(step: number, baseDelay = REVEAL_BASE_DELAY_MS) {
  return FadeInDown.delay(baseDelay + step * REVEAL_STAGGER_MS).duration(REVEAL_DURATION_MS);
}

export type RevealSectionProps = {
  step: number;
  children: ReactNode;
  className?: string;
  baseDelay?: number;
};

export function RevealSection({ step, children, className, baseDelay }: RevealSectionProps) {
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View entering={reducedMotion ? undefined : staggeredFadeIn(step, baseDelay)} className={className}>
      {children}
    </Animated.View>
  );
}
