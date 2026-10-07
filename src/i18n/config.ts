export const I18N_STORAGE_KEY = '@scoutx/language';

export const DEFAULT_LANGUAGE = 'en' as const;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const NAMESPACES = [
  'common',
  'navigation',
  'auth',
  'portfolio',
  'career',
  'statistics',
  'gps',
  'scout',
  'settings',
  'notifications',
  'errors',
  'validation',
  'trust',
  'trials',
  'activity',
  'evidence',
  'development',
  'passport',
  'matchAnalysis',
  'media',
  'safety',
  'legal',
] as const;

export type AppNamespace = (typeof NAMESPACES)[number];

export const RTL_LANGUAGES: SupportedLanguageCode[] = [];

export function isSupportedLanguage(code: string): code is SupportedLanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}

export function isRtlLanguage(code: SupportedLanguageCode): boolean {
  return RTL_LANGUAGES.includes(code);
}
