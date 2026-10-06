import { Image, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { StarRating } from '@/components/primitives/StarRating';
import { Text } from '@/components/primitives/Text';
import { Heading } from '@/components/primitives/Heading';
import { PlayerFormStrip } from '@/features/scout-discovery/components/PlayerFormStrip';
import { RatingPill } from '@/features/scout-discovery/components/RatingPill';
import { VerificationBadge } from '@/features/trust-system';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { joinKnown } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ScoutReportHeroProps = {
  player: DiscoverablePlayer;
};

export function ScoutReportHero({ player }: ScoutReportHeroProps) {
  const { t } = useAppTranslation(['scout', 'evidence']);
  return (
    <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
      <View className="overflow-hidden rounded-2xl">
        <Image source={{ uri: player.coverImageUrl }} className="h-48 w-full" resizeMode="cover" />
        <View className="absolute inset-0 bg-black/35" />
        <View className="absolute bottom-0 left-0 right-0 p-4">
          <Text variant="overline" className="text-white/80">
            Scouting Report
          </Text>
          <View className="mt-2 flex-row items-end gap-3">
            <Avatar
              source={{ uri: player.avatarUrl }}
              size="xl"
              className="border-4 border-white/20"
            />
            <View className="flex-1 pb-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Heading level={2} className="text-white">
                  {player.fullName}
                </Heading>
                {player.verified ? (
                  <VerificationBadge entity="player" size="sm" />
                ) : null}
              </View>
              <Text variant="body-sm" className="text-white/85">
                {joinKnown([
                  player.age !== null ? t('scout:playerDetail.ageYears', { count: player.age }) : null,
                  player.nationality,
                  player.club,
                ])}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View className="gap-2">
        <View className="flex-row gap-3">
          <RatingPill
            label={t('scout:intelligence.matches')}
            value={String(player.matchCount)}
            emphasis="primary"
            className="flex-1"
          />
          <RatingPill
            label={t('scout:intelligence.coverage')}
            value={t(`scout:intelligence.coverageState.${player.evidenceCoverage.consistency}`)}
            className="flex-1"
          />
        </View>
        {player.weakFoot !== null || player.skillMoves !== null ? (
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1 rounded-lg bg-background-secondary px-3 py-2">
              <Text variant="caption" color="secondary">
                {t('scout:filters.weakFoot')}
              </Text>
              <StarRating value={player.weakFoot} label={t('scout:filters.weakFoot')} emptyLabel="—" />
            </View>
            <View className="flex-1 gap-1 rounded-lg bg-background-secondary px-3 py-2">
              <Text variant="caption" color="secondary">
                {t('scout:filters.skillMoves')}
              </Text>
              <StarRating
                value={player.skillMoves}
                label={t('scout:filters.skillMoves')}
                emptyLabel="—"
              />
            </View>
          </View>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-2">
          {player.lastEvidenceAt ? (
            <Text variant="caption" color="secondary">
              {t('scout:intelligence.lastEvidence', { date: player.lastEvidenceAt.slice(0, 10) })}
            </Text>
          ) : (
            <Text variant="caption" color="secondary">
              {t('evidence:noRatingHint')}
            </Text>
          )}
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {player.position.map((pos) => (
          <Badge key={pos} label={pos} variant="outline" size="sm" />
        ))}
        {player.availability ? (
          <Badge
            label={t(
              `scout:filters.${player.availability === 'on_loan' ? 'onLoan' : player.availability}`,
            )}
            variant={player.availability === 'available' ? 'success' : 'warning'}
            size="sm"
          />
        ) : null}
      </View>

      <PlayerFormStrip form={player.form} size="md" />
    </Animated.View>
  );
}
