export const lightColors = {
  primary: '#141C1A', primaryForeground: '#FFFFFF',
  accent: '#087F5B', accentForeground: '#FFFFFF', accentMuted: '#DCF3E8',
  // Keep legacy token names compatible while using restrained olive accents.
  gold: '#576B12', goldForeground: '#FFFFFF', goldMuted: '#EDF3D8',
  background: '#F6F8F7', backgroundSecondary: '#EDF2EF',
  surface: '#FFFFFF', surfaceElevated: '#FFFFFF', surfaceCool: '#EDF3F4',
  surfaceOverlay: 'rgba(13,19,17,0.48)',
  textPrimary: '#141C1A', textSecondary: '#47584E', textTertiary: '#617066',
  textInverse: '#FFFFFF', textLink: '#087F5B',
  border: '#D6E0DA', borderStrong: '#A7B9AD', divider: '#E4EBE6',
  success: '#087F5B', successMuted: '#DCF3E8',
  warning: '#92600A', warningMuted: '#FCF0D6',
  error: '#B33E3A', errorMuted: '#FBE6E4', info: '#256A80', infoMuted: '#E2F1F6',
  skeletonBase: '#E4EBE6', skeletonHighlight: '#F6F8F7',
  evidence: '#256A80', aiDerived: '#617066', verification: '#576B12', achievement: '#576B12',
  disabled: '#98A89E', onMedia: '#FFFFFF',
} as const;

export const darkColors = {
  primary: '#F3F7F4', primaryForeground: '#0D1311',
  accent: '#57D6A0', accentForeground: '#061A11', accentMuted: '#183A2C',
  gold: '#C7E56A', goldForeground: '#182204', goldMuted: '#2C361C',
  background: '#0D1311', backgroundSecondary: '#111A15',
  surface: '#151D19', surfaceElevated: '#1C2822', surfaceCool: '#172122',
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
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };
export type ColorScheme = 'light' | 'dark';
