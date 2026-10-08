import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { MAX_MATCHES_PER_SOURCE, type ExternalFootballSource } from '@/features/football-sources/core';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type LinkSourceToMatchesModalProps = {
  source: ExternalFootballSource | null;
  matches: PlayerMatchStatistics[];
  saving: boolean;
  errorText?: string | null;
  onClose: () => void;
  /** Only the link changes; the match record itself is never edited. */
  onConfirm: (matchIds: string[]) => void;
};

export function LinkSourceToMatchesModal({ source, matches, saving, errorText, onClose, onConfirm }: LinkSourceToMatchesModalProps) {
  const { t, i18n } = useAppTranslation('passport');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(source?.matchIds ?? []);
  }, [source]);

  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < MAX_MATCHES_PER_SOURCE
          ? [...current, id]
          : current,
    );

  return (
    <Modal visible={source !== null} onClose={onClose} title={t('footballSources.matches.title')} size="md">
      <View className="gap-4">
        <Text variant="body-sm" color="secondary">
          {t('footballSources.matches.body')}
        </Text>
        {sorted.length === 0 ? (
          <Text variant="body-sm">{t('footballSources.matches.none')}</Text>
        ) : (
          <View className="gap-2">
            {sorted.map((match) => {
              const isSelected = selected.includes(match.id);
              return (
                <Button
                  key={match.id}
                  size="sm"
                  variant={isSelected ? 'accent' : 'secondary'}
                  className="justify-start"
                  accessibilityRole="checkbox"
                  aria-checked={isSelected}
                  onPress={() => toggle(match.id)}
                >
                  {`${match.opponent} · ${new Date(match.date).toLocaleDateString(i18n.language)}`}
                </Button>
              );
            })}
          </View>
        )}
        {errorText ? (
          <Text variant="body-sm" color="error">
            {errorText}
          </Text>
        ) : null}
        <Button variant="accent" loading={saving} disabled={sorted.length === 0} onPress={() => onConfirm(selected)}>
          {t('footballSources.matches.confirm')}
        </Button>
      </View>
    </Modal>
  );
}
