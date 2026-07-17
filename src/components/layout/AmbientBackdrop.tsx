import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

export type AmbientMood = 'warm' | 'cool' | 'celebration';

export type AmbientBackdropProps = {
  /** warm = player identity; cool = scout professional; celebration = career moments */
  mood?: AmbientMood;
};

/**
 * Cinematic atmosphere for ScoutX identity platform.
 * Light mode leans champagne-gold + soft emerald; dark keeps a subtler gold wash.
 */
export function AmbientBackdrop({ mood = 'warm' }: AmbientBackdropProps) {
  const { isDark, colors } = useTheme();
  const { width, height } = useWindowDimensions();

  const darkStops =
    mood === 'celebration'
      ? {
          top: colors.background,
          mid: '#1F2A24',
          bottom: colors.accent,
          bottomOpacity: 0.22,
          goldHighlight: colors.gold,
          goldOpacity: 0.2,
        }
      : mood === 'cool'
        ? {
            top: colors.background,
            mid: colors.surfaceCool,
            bottom: colors.accent,
            bottomOpacity: 0.08,
            goldHighlight: colors.gold,
            goldOpacity: 0.06,
          }
        : {
            top: colors.background,
            mid: colors.surfaceElevated,
            bottom: colors.accent,
            bottomOpacity: 0.14,
            goldHighlight: colors.gold,
            goldOpacity: 0.1,
          };

  const lightStops =
    mood === 'celebration'
      ? {
          top: colors.goldMuted,
          mid: colors.background,
          bottom: colors.accent,
          bottomOpacity: 0.12,
          goldHighlight: colors.gold,
          goldOpacity: 0.22,
        }
      : mood === 'cool'
        ? {
            top: colors.surfaceCool,
            mid: colors.background,
            bottom: colors.accent,
            bottomOpacity: 0.06,
            goldHighlight: colors.gold,
            goldOpacity: 0.1,
          }
        : {
            top: colors.goldMuted,
            mid: colors.background,
            bottom: colors.accent,
            bottomOpacity: 0.08,
            goldHighlight: colors.gold,
            goldOpacity: 0.18,
          };

  const stops = isDark ? darkStops : lightStops;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={height} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="ambientWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stops.top} stopOpacity="1" />
            <Stop offset="0.55" stopColor={stops.mid} stopOpacity="1" />
            <Stop offset="1" stopColor={stops.bottom} stopOpacity={stops.bottomOpacity} />
          </LinearGradient>
          {stops.goldHighlight ? (
            <LinearGradient id="ambientGold" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={stops.goldHighlight} stopOpacity="0" />
              <Stop offset="0.55" stopColor={stops.goldHighlight} stopOpacity={stops.goldOpacity * 0.45} />
              <Stop offset="1" stopColor={stops.goldHighlight} stopOpacity={stops.goldOpacity} />
            </LinearGradient>
          ) : null}
        </Defs>

        <Rect x="0" y="0" width="390" height="844" fill="url(#ambientWash)" />
        {stops.goldHighlight ? (
          <Rect x="0" y="0" width="390" height="844" fill="url(#ambientGold)" />
        ) : null}

        <Rect
          x="0"
          y="0"
          width="390"
          height="844"
          fill={colors.background}
          opacity={
            mood === 'celebration'
              ? isDark
                ? 0.28
                : 0.18
              : mood === 'cool'
                ? isDark
                  ? 0.5
                  : 0.34
                : isDark
                  ? 0.4
                  : 0.24
          }
        />
      </Svg>
    </View>
  );
}
