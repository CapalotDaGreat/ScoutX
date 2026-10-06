import { Pressable, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { HeaderIconButton } from '@/components/navigation/HeaderIconButton';
import { useScoutAllTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ScoutTrialsInboxScreenProps = {
  onPlayerPress: (playerId: string) => void;
  onSettingsPress?: () => void;
  nestedUnderSegment?: boolean;
};

export function ScoutTrialsInboxScreen({
  onPlayerPress,
  onSettingsPress,
  nestedUnderSegment = false,
}: ScoutTrialsInboxScreenProps) {
  const { t } = useAppTranslation(['navigation', 'common', 'trials']);
  const { trials, isLoading, error } = useScoutAllTrialInvitations();

  const screenProps = nestedUnderSegment
    ? { safeAreaEdges: ['left', 'right'] as Array<'left' | 'right'>, embeddedInTabShell: true as const }
    : { embeddedInTabShell: true as const };

  if (isLoading) {
    return (
      <Screen title={t('tabs.trials')} subtitle={t('trials:scoutInboxSubtitle')} safeArea {...screenProps}>
        <SkeletonLoader variant="card" count={3} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('tabs.trials')}
      subtitle={t('trials:scoutInboxFullSubtitle')}
      safeArea
      {...screenProps}
      headerActions={
        onSettingsPress ? (
          <HeaderIconButton accessibilityLabel={t('common:settings')} onPress={onSettingsPress} />
        ) : undefined
      }
      error={error}
    >
      {trials.length === 0 ? (
        <EmptyState
          title={t('trials:scoutInboxEmptyTitle')}
          description={t('trials:scoutInboxEmptyDescription')}
        />
      ) : (
        <View className="gap-3">
          {trials.map((trial) => (
            <Pressable
              key={trial.id}
              accessibilityRole="button"
              onPress={() => onPlayerPress(trial.playerId)}
            >
              <Card variant="outlined" padding="md" className="gap-2">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text weight="semibold">{trial.playerName}</Text>
                    <Text variant="caption" color="secondary">
                      {trial.club} · {new Date(trial.scheduledDate).toLocaleDateString()}
                    </Text>
                  </View>
                  <Badge variant="outline" label={trial.status} size="sm" />
                </View>
                {trial.location ? (
                  <Text variant="body-sm" color="secondary">
                    {trial.location}
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
