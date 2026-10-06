import { Pressable } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type { DiscoverablePlayer } from '@/features/scout-discovery/types';
import type { SimilarPlayerScore } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type SimilarPlayersCardProps = {
  scores: SimilarPlayerScore[];
  playersById: Record<string, DiscoverablePlayer>;
  onPressPlayer: (playerId: string) => void;
};

export function SimilarPlayersCard({ scores, playersById, onPressPlayer }: SimilarPlayersCardProps) {
  const { t } = useAppTranslation(['scout']);

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="body" className="font-sans-semibold">{t('scout:intelligence.similarTitle')}</Text>
      {scores.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.similarEmpty')}
        </Text>
      ) : (
        scores.map((score) => {
          const player = playersById[score.playerId];
          if (!player) {
            return null;
          }
          return (
            <Pressable
              key={score.playerId}
              accessibilityRole="button"
              onPress={() => onPressPlayer(score.playerId)}
              className="rounded-xl border border-border px-3 py-2"
            >
              <Text variant="body-sm" className="font-sans-semibold">
                {player.fullName}
              </Text>
              <Text variant="caption" color="secondary">
                {[
                  score.sharedPositions.join('/'),
                  score.sameClub ? player.club : null,
                  score.sameLeague ? player.league : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}
