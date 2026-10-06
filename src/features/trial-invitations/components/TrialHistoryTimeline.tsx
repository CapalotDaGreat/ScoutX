import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { formatTrialDate } from '@/features/trial-invitations/models/TrialInvitationModel';
import { type TrialHistoryEntry } from '@/features/trial-invitations/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type TrialHistoryTimelineProps = {
  history: TrialHistoryEntry[];
};

const HISTORY_ACTION_KEYS = {
  created: 'history.created',
  accepted: 'history.accepted',
  declined: 'history.declined',
  rescheduled: 'history.rescheduled',
  cancelled: 'history.cancelled',
  completed: 'history.completed',
  note_added: 'history.note_added',
} as const;

export function TrialHistoryTimeline({ history }: TrialHistoryTimelineProps) {
  const { t } = useAppTranslation(['trials']);

  if (history.length === 0) {
    return (
      <Text variant="body-sm" color="secondary">
        {t('historyEmpty')}
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {history.map((entry, index) => (
        <View key={entry.id} className="flex-row gap-3">
          <View className="items-center">
            <View className="h-2.5 w-2.5 rounded-full bg-accent" />
            {index < history.length - 1 ? (
              <View className="mt-1 w-px flex-1 bg-border" />
            ) : null}
          </View>
          <View className="mb-2 flex-1">
            <Text weight="semibold">{t(HISTORY_ACTION_KEYS[entry.action])}</Text>
            <Text variant="caption" color="secondary">
              {entry.actorName} · {new Date(entry.timestamp).toLocaleString()}
            </Text>
            {entry.previousDate && entry.newDate ? (
              <Text variant="body-sm" color="secondary" className="mt-1">
                {formatTrialDate(entry.previousDate)} → {formatTrialDate(entry.newDate)}
              </Text>
            ) : null}
            {entry.note ? (
              <Text variant="body-sm" color="secondary" className="mt-1">
                {entry.note}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
