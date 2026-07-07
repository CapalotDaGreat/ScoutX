import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDistanceKm,
  formatNumber,
  formatPercentage,
  formatTime,
} from '@/i18n/formatters';
import type { SupportedLanguageCode } from '@/i18n/config';

export function useAppFormatters() {
  const { i18n } = useTranslation();
  const language = i18n.language as SupportedLanguageCode;

  return useMemo(
    () => ({
      language,
      formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
        formatDate(value, language, options),
      formatTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
        formatTime(value, language, options),
      formatDateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
        formatDateTime(value, language, options),
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, language, options),
      formatDistanceKm: (valueKm: number) => formatDistanceKm(valueKm, language),
      formatPercentage: (value: number, options?: Intl.NumberFormatOptions) =>
        formatPercentage(value, language, options),
      formatCurrency: (value: number, currency = 'EUR') =>
        formatCurrency(value, language, currency),
    }),
    [language],
  );
}
