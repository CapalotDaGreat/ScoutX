import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { formatTrialDate } from '@/features/trial-invitations/models/TrialInvitationModel';
import { type TrialHistoryEntry } from '@/features/trial-invitations/types';

export type TrialHistoryTimelineProps = {
  history: TrialHistoryEntry[];
};

const actionLabels: Record<TrialHistoryEntry['action'], string> = {
  created: 'Invitation created',
  accepted: 'Player accepted',
  declined: 'Player declined',
  rescheduled: 'Trial rescheduled',
  cancelled: 'Invitation cancelled',
  completed: 'Trial completed',
  note_added: 'Note added',
};

export function TrialHistoryTimeline({ history }: TrialHistoryTimelineProps) {
  if (history.length === 0) {
    return (
      <Text variant="body-sm" color="secondary">
        No history yet.
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {history.map((entry, index) => (
        <View key={entry.id} className="flex-row gap-3">
          <View className="items-center">
            <View className="h-2.5 w-2.5 rounded-full bg-accent dark:bg-green-500" />
            {index < history.length - 1 ? (
              <View className="mt-1 w-px flex-1 bg-border dark:bg-neutral-700" />
            ) : null}
          </View>
          <View className="mb-2 flex-1">
            <Text weight="semibold">{actionLabels[entry.action]}</Text>
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
