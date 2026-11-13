import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { pitchSpotForPosition } from './positionPitch';

export type PositionPitchProps = {
  /** The player's stated position (self-entered profile field). */
  position: string | null | undefined;
  /** Rendered width; height follows the 2:3 pitch ratio. */
  width?: number;
  /** 'pitch' when drawn on a PitchSurface, 'surface' on a normal card. */
  tone?: 'pitch' | 'surface';
  accessibilityLabel?: string;
};

/**
 * A small pitch that marks where the stated position plays. It shows a profile field,
 * not tracked movement: no heat, no trails. Draws the pitch without a marker when the position is unknown.
 */
export function PositionPitch({ position, width = 64, tone = 'surface', accessibilityLabel }: PositionPitchProps) {
  const { colors } = useTheme();
  const spot = pitchSpotForPosition(position);
  const height = Math.round(width * 1.5);
  const line = tone === 'pitch' ? colors.pitchLine : colors.borderStrong;
  const fill = tone === 'pitch' ? colors.pitchRaised : colors.backgroundSecondary;
  const marker = tone === 'pitch' ? colors.highlight : colors.accent;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? (position?.trim() ? `Position: ${position.trim()}` : 'Position not set')}
      style={{ width, height }}
    >
      <Svg width={width} height={height} viewBox="0 0 100 150">
        <Rect x={2} y={2} width={96} height={146} rx={8} fill={fill} stroke={line} strokeWidth={2} />
        <Line x1={2} y1={75} x2={98} y2={75} stroke={line} strokeWidth={2} />
        <Circle cx={50} cy={75} r={14} fill="none" stroke={line} strokeWidth={2} />
        <Path d="M28 2 V22 H72 V2" fill="none" stroke={line} strokeWidth={2} />
        <Path d="M28 148 V128 H72 V148" fill="none" stroke={line} strokeWidth={2} />
        {spot ? (
          <>
            <Circle cx={spot.x * 100} cy={150 - spot.y * 150} r={11} fill={marker} opacity={0.28} />
            <Circle cx={spot.x * 100} cy={150 - spot.y * 150} r={6} fill={marker} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
