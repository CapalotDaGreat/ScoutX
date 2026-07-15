import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * Subtle pitch-inspired atmosphere without competing with UI content.
 * Uses theme surfaces + a faint watermark. Day/night follows color scheme.
 */
export function AmbientBackdrop() {
  const { isDark, colors } = useTheme();
  const { width, height } = useWindowDimensions();

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
            <Stop
              offset="0"
              stopColor={isDark ? '#122016' : '#F3F7F0'}
              stopOpacity="1"
            />
            <Stop offset="0.55" stopColor={colors.background} stopOpacity="1" />
            <Stop
              offset="1"
              stopColor={isDark ? '#0B0F0C' : '#EEF4EC'}
              stopOpacity="1"
            />
          </LinearGradient>
        </Defs>

        <Rect x="0" y="0" width="390" height="844" fill="url(#ambientWash)" />

        {/* Very faint center circle + halfway line (watermark only) */}
        <Line
          x1="40"
          y1="520"
          x2="350"
          y2="520"
          stroke={isDark ? '#A3E635' : '#65A30D'}
          strokeOpacity={isDark ? 0.06 : 0.05}
          strokeWidth="2"
        />
        <Rect
          x="145"
          y="445"
          width="100"
          height="150"
          rx="50"
          stroke={isDark ? '#A3E635' : '#65A30D'}
          strokeOpacity={isDark ? 0.06 : 0.05}
          strokeWidth="2"
          fill="none"
        />

        {/* Top readability veil */}
        <Rect
          x="0"
          y="0"
          width="390"
          height="844"
          fill={colors.background}
          opacity={isDark ? 0.35 : 0.2}
        />
      </Svg>
    </View>
  );
}
