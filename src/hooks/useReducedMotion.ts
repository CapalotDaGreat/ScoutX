import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { motion } from '@/theme/tokens/motion';

/**
 * Tracks the OS "reduce motion" preference. Components use it to skip entering/exiting
 * animations and to collapse durations so UI state changes still happen instantly.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) {
          setReduced(value);
        }
      })
      .catch(() => {
        // Preference unavailable on this platform; keep animations enabled.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      if (active) {
        setReduced(value);
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/** Returns the motion duration to use, collapsing to zero when reduced motion is on. */
export function useMotionDuration(key: keyof Omit<typeof motion, 'spring'>): number {
  const reduced = useReducedMotion();
  return reduced ? 0 : motion[key];
}
