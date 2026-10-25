import { type ReactNode } from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type AnimatedListItemProps = {
  children: ReactNode;
  index?: number;
  maxStaggerIndex?: number;
  staggerMs?: number;
  durationMs?: number;
  className?: string;
};

export function AnimatedListItem({
  children,
  index = 0,
  maxStaggerIndex = 8,
  staggerMs = 35,
  durationMs = 320,
  className,
}: AnimatedListItemProps) {
  const reducedMotion = useReducedMotion();
  const animation = reducedMotion ? undefined : FadeInUp.delay(Math.min(index, maxStaggerIndex) * staggerMs).duration(durationMs);

  return (
    <Animated.View entering={animation} className={className}>
      {children}
    </Animated.View>
  );
}
