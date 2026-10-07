import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { EmptyState } from '@/components/feedback/EmptyState';
import { GpsSessionCard } from '@/features/gps/components/GpsSessionCard';
import { type GpsSession } from '@/features/gps/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type GpsSessionHistoryProps = {
  sessions: GpsSession[];
};

export function GpsSessionHistory({ sessions }: GpsSessionHistoryProps) {
  const { t } = useAppTranslation('gps');
  return (
    <Card variant="default" padding="lg" className="gap-4">
      <View>
        <Heading level={3}>{t('sessionHistory')}</Heading>
        <Text variant="body-sm" color="secondary" className="mt-1">
          {t('controls.historySubtitle')}
        </Text>
      </View>

      {sessions.length === 0 ? (
        <EmptyState
          title={t('noSessions')}
          description={t('noSessionsDescription')}
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
