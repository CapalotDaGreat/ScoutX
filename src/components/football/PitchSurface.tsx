import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

export type PitchSurfaceProps = ViewProps & {
  children: ReactNode;
  className?: string;
  /** Chalk markings behind the content. Decorative, hidden from assistive tech. */
  markings?: 'halfway' | 'none';
};

/**
 * The deep-turf identity surface: a flat pitch colour with faint chalk lines.
 * Reserved for identity (profile, Passport, welcome) so it keeps its meaning. No gradients or motion.
 */
export function PitchSurface({ children, className, markings = 'halfway', style, ...props }: PitchSurfaceProps) {
  const { colors } = useTheme();
  return (
    <View
      className={cn('overflow-hidden rounded-2xl', className)}
      style={[{ backgroundColor: colors.pitch }, style]}
      {...props}
    >
      {markings === 'halfway' ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 320 200" preserveAspectRatio="xMaxYMid slice">
            <Rect x={-20} y={14} width={360} height={172} fill="none" stroke={colors.pitchLine} strokeWidth={1.5} />
            <Line x1={236} y1={14} x2={236} y2={186} stroke={colors.pitchLine} strokeWidth={1.5} />
            <Circle cx={236} cy={100} r={46} fill="none" stroke={colors.pitchLine} strokeWidth={1.5} />
            <Circle cx={236} cy={100} r={2.5} fill={colors.pitchLine} />
          </Svg>
        </View>
      ) : null}
      {children}
    </View>
  );
}
