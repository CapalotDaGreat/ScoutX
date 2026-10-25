import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';

export type AmbientMood = 'warm' | 'cool' | 'celebration';
export type AmbientBackdropProps = { mood?: AmbientMood };

export function AmbientBackdrop({ mood = 'warm' }: AmbientBackdropProps) {
  const { colors } = useTheme();
  const backgrounds: Record<AmbientMood, string> = {
    warm: colors.background,
    cool: colors.background,
    celebration: colors.backgroundSecondary,
  };
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: backgrounds[mood] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
