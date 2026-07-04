import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { EmptyState } from '@/components/feedback/EmptyState';
import { GpsSessionCard } from '@/features/gps/components/GpsSessionCard';
import { type GpsSession } from '@/features/gps/types';

export type GpsSessionHistoryProps = {
  sessions: GpsSession[];
};

export function GpsSessionHistory({ sessions }: GpsSessionHistoryProps) {
  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>Session History</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          Previously recorded GPS match sessions.
        </Text>
      </View>

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Record a match to build your GPS movement history."
        />
      ) : (
        <View className="gap-3">
          {sessions.map((session) => (
            <GpsSessionCard key={session.id} session={session} />
          ))}
        </View>
      )}
    </Card>
  );
}
