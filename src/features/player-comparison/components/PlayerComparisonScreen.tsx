import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Section } from '@/components/layout/Section';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { ComparisonAchievementsSection } from '@/features/player-comparison/components/ComparisonAchievementsSection';
import { ComparisonCareerSection } from '@/features/player-comparison/components/ComparisonCareerSection';
import { ComparisonMetricTable } from '@/features/player-comparison/components/ComparisonMetricTable';
import { ComparisonPlayerPickerModal } from '@/features/player-comparison/components/ComparisonPlayerPickerModal';
import { ComparisonPlayerStrip } from '@/features/player-comparison/components/ComparisonPlayerStrip';
import { ComparisonRadarChart } from '@/features/player-comparison/components/ComparisonRadarChart';
import { ComparisonSectionNav } from '@/features/player-comparison/components/ComparisonSectionNav';
import { ComparisonTrendChart } from '@/features/player-comparison/components/ComparisonTrendChart';
import { ComparisonVideosSection } from '@/features/player-comparison/components/ComparisonVideosSection';
import { usePlayerComparison } from '@/features/player-comparison/hooks/usePlayerComparison';
import { useCompactLayout } from '@/hooks/useCompactLayout';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type ComparisonSectionKey } from '@/features/player-comparison/types';

export type PlayerComparisonScreenProps = {
  onDiscoverPress?: () => void;
  onBack?: () => void;
  embeddedInTabShell?: boolean;
};

type PickerMode =
  | { type: 'add' }
  | { type: 'replace'; playerId: string };

export function PlayerComparisonScreen({
  onDiscoverPress,
  onBack,
  embeddedInTabShell = false,
}: PlayerComparisonScreenProps) {
  const { t } = useAppTranslation(['scout', 'common', 'errors']);
  const { isTablet } = useCompactLayout();
  const {
    players,
    profiles,
    mergedTrends,
    statisticsRows,
    physicalRows,
    technicalRows,
    gpsRows,
    comparisonPlayerIds,
    addToComparison,
    removeFromComparison,
    replaceComparisonPlayer,
    clearComparison,
    canAddToComparison,
    playerPool,
  } = usePlayerComparison();

  const [activeSection, setActiveSection] = useState<ComparisonSectionKey>('radar');
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);

  const playerNames = useMemo(
    () =>
      Object.fromEntries(
        players.map((player) => [player.id, player.fullName.split(' ')[0] ?? player.fullName]),
      ),
    [players],
  );

  const handleAddPlayer = useCallback(
    (playerId: string) => {
      if (pickerMode?.type === 'replace') {
        replaceComparisonPlayer(pickerMode.playerId, playerId);
      } else {
        addToComparison(playerId);
      }
      setPickerMode(null);
    },
    [addToComparison, pickerMode, replaceComparisonPlayer],
  );

  const excludedPickerIds = useMemo(() => {
    if (pickerMode?.type === 'replace') {
      return comparisonPlayerIds.filter((id) => id !== pickerMode.playerId);
    }
    return comparisonPlayerIds;
  }, [comparisonPlayerIds, pickerMode]);

  const openAddPicker = useCallback(() => {
    if (canAddToComparison) {
      setPickerMode({ type: 'add' });
    }
  }, [canAddToComparison]);

  const renderSection = () => {
    switch (activeSection) {
      case 'radar':
        return <ComparisonRadarChart profiles={profiles} />;
      case 'statistics':
        return (
          <ComparisonMetricTable
            rows={statisticsRows}
            playerIds={comparisonPlayerIds}
            playerNames={playerNames}
          />
        );
      case 'trends':
        return (
          <ComparisonTrendChart
            trends={mergedTrends}
            playerIds={comparisonPlayerIds}
            playerNames={playerNames}
          />
        );
      case 'physical':
        return (
          <ComparisonMetricTable
            rows={physicalRows}
            playerIds={comparisonPlayerIds}
            playerNames={playerNames}
          />
        );
      case 'technical':
        return (
          <ComparisonMetricTable
            rows={technicalRows}
            playerIds={comparisonPlayerIds}
            playerNames={playerNames}
          />
        );
      case 'gps':
        return (
          <ComparisonMetricTable
            rows={gpsRows}
            playerIds={comparisonPlayerIds}
            playerNames={playerNames}
          />
        );
      case 'career':
        return <ComparisonCareerSection profiles={profiles} />;
      case 'videos':
        return <ComparisonVideosSection profiles={profiles} />;
      case 'achievements':
        return <ComparisonAchievementsSection profiles={profiles} />;
      default:
        return null;
    }
  };

  const sectionTitle = (key: ComparisonSectionKey) =>
    t(`scout:comparison.sections.${key}` as const);

  const needsTwoPlayers = players.length < 2;
  const metricSubtitle =
    activeSection === 'statistics' ||
    activeSection === 'physical' ||
    activeSection === 'technical' ||
    activeSection === 'gps'
      ? t('scout:comparison.metricSubtitle')
      : undefined;

  return (
    <>
      <Screen
        title={t('scout:comparison.title')}
        subtitle={t('scout:comparison.subtitleFull')}
        safeArea
        embeddedInTabShell={embeddedInTabShell}
        footer={
          onBack ? (
            <Button variant="secondary" onPress={onBack} fullWidth>
              {t('common:back')}
            </Button>
          ) : undefined
        }
        empty={players.length === 0}
        emptyTitle={t('scout:comparison.emptyTitle')}
        emptyDescription={t('scout:comparison.emptyDescription')}
        emptyActionLabel={onDiscoverPress ? t('scout:pipeline.discoverPlayers') : undefined}
        onEmptyAction={onDiscoverPress}
        contentClassName="gap-6"
      >
        {players.length > 0 ? (
          <View className="flex-row justify-end">
            <Button variant="ghost" size="sm" onPress={clearComparison}>
              {t('scout:comparison.clearAll')}
            </Button>
          </View>
        ) : null}

        <ComparisonPlayerStrip
          players={players}
          onAddPlayer={openAddPicker}
          onRemovePlayer={removeFromComparison}
          onReplacePlayer={(playerId) => setPickerMode({ type: 'replace', playerId })}
        />

        {needsTwoPlayers ? (
          <View className="items-center gap-3 py-6">
            <Text variant="body-sm" color="secondary" className="text-center">
              {t('scout:comparison.needsTwoPlayers')}
            </Text>
            {onDiscoverPress ? (
              <Button variant="secondary" onPress={onDiscoverPress}>
                {t('scout:pipeline.discoverPlayers')}
              </Button>
            ) : null}
          </View>
        ) : (
          <>
            {isTablet ? (
              <View className="flex-row gap-6">
                <View className="w-[220px]">
                  <ComparisonSectionNav
                    activeSection={activeSection}
                    onSectionChange={setActiveSection}
                    layout="vertical"
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Section title={sectionTitle(activeSection)} subtitle={metricSubtitle}>
                    {renderSection()}
                  </Section>
                </View>
              </View>
            ) : (
              <>
                <ComparisonSectionNav activeSection={activeSection} onSectionChange={setActiveSection} />
                <Section title={sectionTitle(activeSection)} subtitle={metricSubtitle}>
                  {renderSection()}
                </Section>
              </>
            )}
          </>
        )}
      </Screen>

      <ComparisonPlayerPickerModal
        visible={pickerMode !== null}
        title={
          pickerMode?.type === 'replace'
            ? t('scout:comparison.replacePlayer')
            : t('scout:comparison.addPlayerToComparison')
        }
        players={playerPool}
        excludedIds={excludedPickerIds}
        onClose={() => setPickerMode(null)}
        onSelect={(player) => handleAddPlayer(player.id)}
      />
    </>
  );
}
