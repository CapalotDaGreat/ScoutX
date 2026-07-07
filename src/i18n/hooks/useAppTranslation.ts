import { useTranslation } from 'react-i18next';
import type { AppNamespace } from '@/i18n/config';

export function useAppTranslation(namespace?: AppNamespace | AppNamespace[]) {
  return useTranslation(namespace);
}
