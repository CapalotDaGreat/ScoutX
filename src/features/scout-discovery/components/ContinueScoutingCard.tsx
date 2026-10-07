import { Image, Pressable, View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { Heading } from '@/components/primitives/Heading';
import { Button } from '@/components/primitives/Button';
import { PlayerFormStrip } from '@/features/scout-discovery/components/PlayerFormStrip';
import { formatRating, joinKnown } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ContinueScoutingCardProps = {
  player: DiscoverablePlayer;
  onPress: (player: DiscoverablePlayer) => void;
  pipelineStageLabel?: string | null;
  onOpenPipelinePress?: () => void;
};

export function ContinueScoutingCard({
  player,
  onPress,
  pipelineStageLabel = null,
  onOpenPipelinePress,
}: ContinueScoutingCardProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('continueCard.a11y', { name: player.fullName })}
      onPress={() => onPress(player)}
    >
      <Card variant="elevated" padding="lg" className="overflow-hidden bg-surface-cool">
        <View className="absolute right-0 top-0 h-24 w-24 rounded-full bg-accent/10" />
        <View className="gap-4">
          <View>
            <Text variant="overline" color="secondary" className="uppercase">
              {t('continueCard.overline')}
            </Text>
            <Heading level={3} className="mt-1">
              {t('continueCard.title')}
            </Heading>
            {pipelineStageLabel ? (
              <Text variant="body-sm" color="secondary" className="mt-1">
                {t('continueCard.stage', { stage: pipelineStageLabel })}
              </Text>
            ) : null}
          </View>

          <View className="flex-row items-center gap-3">
            <Image source={{ uri: player.avatarUrl }} className="h-14 w-14 rounded-full" />
            <View className="flex-1 gap-1">
              <Text weight="semibold">{player.fullName}</Text>
              <Text variant="body-sm" color="secondary">
                {joinKnown([
                  player.club,
                  player.overallRating !== null ? `OVR ${formatRating(player.overallRating)}` : null,
                  player.potentialRating !== null ? `POT ${formatRating(player.potentialRating)}` : null,
                ])}
              </Text>
              <PlayerFormStrip form={player.form} size="md" />
            </View>
          </View>

          <View className="gap-2">
            <Button
              variant="accent"
              rightIcon={<ArrowRight size={18} color={colors.accentForeground} />}
              onPress={() => onPress(player)}
            >
              {t('continueCard.openReport')}
            </Button>
            {onOpenPipelinePress ? (
              <Button variant="secondary" onPress={onOpenPipelinePress}>
                {t('continueCard.openPipeline')}
              </Button>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
