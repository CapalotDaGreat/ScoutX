export const lightColors = {
  primary: '#141C1A', primaryForeground: '#FFFFFF',
  accent: '#07704F', accentForeground: '#FFFFFF', accentMuted: '#DCF3E8',
  // Keep legacy token names compatible while using restrained olive accents.
  gold: '#576B12', goldForeground: '#FFFFFF', goldMuted: '#EDF3D8',
  background: '#F3F5F1', backgroundSecondary: '#E8EDE7',
  surface: '#FFFFFF', surfaceElevated: '#FFFFFF', surfaceCool: '#EDF3F4',
  surfaceOverlay: 'rgba(13,19,17,0.48)',
  textPrimary: '#121A17', textSecondary: '#44544B', textTertiary: '#5E6D63',
  textInverse: '#FFFFFF', textLink: '#07704F',
  border: '#D6E0DA', borderStrong: '#A7B9AD', divider: '#E4EBE6',
  success: '#07704F', successMuted: '#DCF3E8',
  warning: '#92600A', warningMuted: '#FCF0D6',
  error: '#B33E3A', errorMuted: '#FBE6E4', info: '#256A80', infoMuted: '#E2F1F6',
  skeletonBase: '#E4EBE6', skeletonHighlight: '#F6F8F7',
  evidence: '#256A80', aiDerived: '#617066', verification: '#576B12', achievement: '#576B12',
  disabled: '#98A89E', onMedia: '#FFFFFF',
  // Touchline: the deep-turf identity surface, its chalk lines and the single floodlight highlight.
  pitch: '#0F3D2E', pitchRaised: '#17503D', pitchLine: 'rgba(255,255,255,0.14)',
  onPitch: '#FFFFFF', onPitchMuted: '#BFD8CC', highlight: '#D7F36B', highlightForeground: '#18240A',
} as const;

export const darkColors = {
  primary: '#F3F7F4', primaryForeground: '#0D1311',
  accent: '#57D6A0', accentForeground: '#061A11', accentMuted: '#183A2C',
  gold: '#C7E56A', goldForeground: '#182204', goldMuted: '#2C361C',
  background: '#0B110E', backgroundSecondary: '#101813',
  surface: '#141C18', surfaceElevated: '#1B2620', surfaceCool: '#172122',
  surfaceOverlay: 'rgba(5,10,8,0.72)',
  textPrimary: '#F3F7F4', textSecondary: '#BCCABF', textTertiary: '#8F9F94',
  textInverse: '#0D1311', textLink: '#57D6A0',
  border: '#2F3E35', borderStrong: '#566B5D', divider: '#26342C',
  success: '#57D6A0', successMuted: '#183A2C',
  warning: '#E4B860', warningMuted: '#362C18',
  error: '#F28C85', errorMuted: '#3A201F', info: '#88C9DD', infoMuted: '#1C3039',
  skeletonBase: '#1C2822', skeletonHighlight: '#2F3E35',
  evidence: '#88C9DD', aiDerived: '#8F9F94', verification: '#C7E56A', achievement: '#C7E56A',
  disabled: '#53645A', onMedia: '#FFFFFF',
  pitch: '#12392B', pitchRaised: '#1A4A39', pitchLine: 'rgba(255,255,255,0.12)',
  onPitch: '#F3F7F4', onPitchMuted: '#A9C7B9', highlight: '#D7F36B', highlightForeground: '#18240A',
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };
export type ColorScheme = 'light' | 'dark';
