import { useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { type ExternalFootballSource, type FootballSourceVisibility } from '@/features/football-sources/core';
import { AddFootballSourceSheet } from '@/features/football-sources/components/AddFootballSourceSheet';
import { ExternalFootballSourceCard } from '@/features/football-sources/components/ExternalFootballSourceCard';
import { LinkSourceToMatchesModal } from '@/features/football-sources/components/LinkSourceToMatchesModal';
import { useOwnFootballSources } from '@/features/football-sources/hooks/useOwnFootballSources';
import {
  FootballSourceError,
  removeExternalFootballSource,
  updateExternalFootballSource,
  type FootballSourceErrorReason,
} from '@/features/football-sources/services/footballSourceService';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type FootballSourcesSectionProps = {
  playerId: string;
  matches: PlayerMatchStatistics[];
};

/** The player's own links: add, share, link to matches, remove. */
export function FootballSourcesSection({ playerId, matches }: FootballSourcesSectionProps) {
  const { t } = useAppTranslation('passport');
  const { colors } = useTheme();
  const { sources, isLoading, hasError } = useOwnFootballSources(playerId);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ sourceId: string; reason: FootballSourceErrorReason } | null>(null);
  const [linking, setLinking] = useState<ExternalFootballSource | null>(null);

  const run = async (sourceId: string, action: () => Promise<unknown>): Promise<boolean> => {
    setBusyId(sourceId);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError({ sourceId, reason: caught instanceof FootballSourceError ? caught.reason : 'unknown' });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const changeVisibility = (source: ExternalFootballSource, visibility: FootballSourceVisibility) =>
    void run(source.id, () => updateExternalFootballSource({ sourceId: source.id, visibility }));

  return (
    <View className="gap-3" testID="football-sources-section">
      <Text variant="body-sm" color="secondary">
        {t('footballSources.subtitle')}
      </Text>

      {!isLoading && sources.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {hasError ? t('footballSources.errors.unknown') : t('footballSources.empty')}
        </Text>
      ) : null}

      {sources.map((source) => (
        <View key={source.id} className="gap-1">
          <ExternalFootballSourceCard
            mode="owner"
            source={source}
            busy={busyId === source.id}
            onChangeVisibility={(visibility) => changeVisibility(source, visibility)}
            onLinkMatches={() => setLinking(source)}
            onRemove={() => void run(source.id, () => removeExternalFootballSource(source.id))}
            testID="football-source-card"
          />
          {error?.sourceId === source.id && linking === null ? (
            <Text variant="caption" color="error">
              {t(`footballSources.errors.${error.reason}`)}
            </Text>
          ) : null}
        </View>
      ))}

      <Button
        variant="secondary"
        leftIcon={<Plus size={16} color={colors.textPrimary} />}
        onPress={() => setAdding(true)}
        className="self-start"
        testID="football-source-add"
      >
        {t('footballSources.add')}
      </Button>

      <AddFootballSourceSheet visible={adding} onClose={() => setAdding(false)} />
      <LinkSourceToMatchesModal
        source={linking}
        matches={matches}
        saving={linking !== null && busyId === linking.id}
        errorText={linking && error?.sourceId === linking.id ? t(`footballSources.errors.${error.reason}`) : null}
        onClose={() => setLinking(null)}
        onConfirm={(matchIds) => {
          if (!linking) return;
          const target = linking;
          void run(target.id, () => updateExternalFootballSource({ sourceId: target.id, matchIds })).then((ok) => {
            if (ok) setLinking(null);
          });
        }}
      />
    </View>
  );
}
