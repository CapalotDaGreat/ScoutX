import { useMemo } from 'react';
import { type ActivityCategory, type ActivityItem, type ActivityType } from '@/features/activity-feed/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export type ActivityLabels = {
  category: (key: ActivityCategory) => string;
  type: (type: ActivityType) => string;
  dateHeading: (iso: string) => string;
  timestamp: (iso: string) => string;
  /** System-generated activities store English copy; show the localized type copy instead. */
  title: (activity: ActivityItem) => string;
  body: (activity: ActivityItem) => string;
};

export function useActivityLabels(): ActivityLabels {
  const { t, i18n } = useAppTranslation(['notifications']);
  const locale = i18n.language;

  return useMemo<ActivityLabels>(() => {
    const type = (value: ActivityType) => t(`notifications:activity.type.${value}`);
    return {
      category: (key) => t(`notifications:activity.category.${key}`),
      type,
      dateHeading: (iso) => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        const today = startOfDay(new Date());
        const target = startOfDay(date);
        if (target === today) return t('notifications:activity.today');
        if (target === today - DAY_MS) return t('notifications:activity.yesterday');
        return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric' }).format(date);
      },
      timestamp: (iso) => {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
        if (minutes < 1) return t('notifications:activity.justNow');
        if (minutes < 60) return t('notifications:activity.minutesAgo', { count: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('notifications:activity.hoursAgo', { count: hours });
        return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
      },
      title: (activity) => (activity.actorId === 'system' ? type(activity.type) : activity.title),
      body: (activity) =>
        activity.actorId === 'system' && activity.type === 'evidence_requested'
          ? t('notifications:activity.systemBody.evidence_requested')
          : activity.body,
    };
  }, [locale, t]);
}
