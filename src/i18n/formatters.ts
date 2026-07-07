import type { SupportedLanguageCode } from '@/i18n/config';

export function getIntlLocale(language: SupportedLanguageCode): string {
  const localeMap: Record<SupportedLanguageCode, string> = {
    en: 'en-GB',
    de: 'de-DE',
    fr: 'fr-FR',
    it: 'it-IT',
    es: 'es-ES',
    pt: 'pt-PT',
    nl: 'nl-NL',
  };

  return localeMap[language];
}

export function formatDate(
  value: Date | string | number,
  language: SupportedLanguageCode,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(date);
}

export function formatTime(
  value: Date | string | number,
  language: SupportedLanguageCode,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getIntlLocale(language), {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatDateTime(
  value: Date | string | number,
  language: SupportedLanguageCode,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(getIntlLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(date);
}

export function formatNumber(
  value: number,
  language: SupportedLanguageCode,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(getIntlLocale(language), options).format(value);
}

export function formatDistanceKm(
  valueKm: number,
  language: SupportedLanguageCode,
): string {
  return `${formatNumber(valueKm, language, {
    maximumFractionDigits: 1,
    minimumFractionDigits: valueKm < 10 ? 1 : 0,
  })} km`;
}

export function formatPercentage(
  value: number,
  language: SupportedLanguageCode,
  options?: Intl.NumberFormatOptions,
): string {
  return formatNumber(value / 100, language, {
    style: 'percent',
    maximumFractionDigits: 0,
    ...options,
  });
}

export function formatCurrency(
  value: number,
  language: SupportedLanguageCode,
  currency = 'EUR',
): string {
  return new Intl.NumberFormat(getIntlLocale(language), {
    style: 'currency',
    currency,
  }).format(value);
}
