import { Pressable, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { HeaderIconButton } from '@/components/navigation/HeaderIconButton';
import { useScoutAllReports } from '@/features/scouting-reports/hooks/useScoutingReports';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ScoutReportsInboxScreenProps = {
  onPlayerPress: (playerId: string) => void;
  onSettingsPress?: () => void;
  nestedUnderSegment?: boolean;
};

export function ScoutReportsInboxScreen({
  onPlayerPress,
  onSettingsPress,
  nestedUnderSegment = false,
}: ScoutReportsInboxScreenProps) {
  const { t } = useAppTranslation(['navigation', 'common']);
  const { reports, isLoading, error } = useScoutAllReports();

  const screenProps = nestedUnderSegment
    ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'>, embeddedInTabShell: true as const }
    : { embeddedInTabShell: true as const };

  if (isLoading) {
    return (
      <Screen title={t('segments.reports')} subtitle="Your scouting notes" safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={3} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('segments.reports')}
      subtitle="Reports across all players you have evaluated"
      safeArea
      {...screenProps}
      headerActions={
        onSettingsPress ? (
          <HeaderIconButton accessibilityLabel={t('common:settings')} onPress={onSettingsPress} />
        ) : undefined
      }
      error={error}
    >
      {reports.length === 0 ? (
        <EmptyState
          title="No scouting reports yet"
          description="Write reports from a player profile. All of your reports appear here as a cross-player index."
        />
      ) : (
        <View className="gap-3">
          {reports.map((report) => (
            <Pressable
              key={report.id}
              accessibilityRole="button"
              onPress={() => onPlayerPress(report.playerId)}
            >
              <Card variant="outlined" padding="md" className="gap-2">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text weight="semibold">{report.playerName}</Text>
                    <Text variant="caption" color="secondary">
                      Updated {new Date(report.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Badge
                    variant="prestige"
                    label={`OVR ${report.ratings.overall}`}
                    size="sm"
                  />
                </View>
                {report.recommendations ? (
                  <Text variant="body-sm" color="secondary" numberOfLines={2}>
                    {report.recommendations}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
