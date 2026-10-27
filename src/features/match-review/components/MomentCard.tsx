import { Image, Pressable, View } from 'react-native';
import { Badge, type BadgeVariant } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { formatClock } from '@/features/match-analysis/services/trackingPresentation';
import { useReviewT } from '../hooks/useReviewT';
import type { EvidenceLabel, MomentCard as MomentCardModel } from '../services/moments';

export const EVIDENCE_BADGE: Record<EvidenceLabel, BadgeVariant> = {
  confirmed: 'success', estimated: 'info', needs_review: 'warning', not_measurable: 'default',
};

export type MomentCardProps = {
  moment: MomentCardModel;
  imageUrl?: string | null;
  onPress: (moment: MomentCardModel) => void;
  selected?: boolean;
  width?: number;
};

/** One moment: what, when, how sure. Tapping opens the player at the clip. */
export function MomentCard({ moment, imageUrl, onPress, selected, width = 168 }: MomentCardProps) {
  const t = useReviewT();
  const kind = t(`review.moments.kind.${moment.titleKey}`);
  const time = formatClock(moment.actionAt);
  return (
    <Pressable
      onPress={() => onPress(moment)}
      accessibilityRole="button"
      accessibilityLabel={`${t('review.moments.open', { kind, time })}. ${t(`review.moments.evidence.${moment.evidence}`)}`}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      testID={`moment-${moment.id}`}
      style={{ width }}
      className={`overflow-hidden rounded-lg border ${selected ? 'border-accent' : 'border-border'} bg-surface`}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width, height: 112 }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={{ width, height: 112 }} className="items-center justify-center bg-background-secondary">
          <Text variant="label" weight="bold" color="secondary">{time}</Text>
          <Text variant="caption" color="tertiary">▶</Text>
        </View>
      )}
      <View className="gap-1 px-2.5 py-2">
        <Text weight="semibold" numberOfLines={1}>{kind}</Text>
        <Text variant="caption" color="secondary">
          {time} · {t('review.moments.duration', { sec: Math.round(moment.durationSec) })}
        </Text>
        {moment.numberRead ? <Text variant="caption" color="secondary" numberOfLines={1}>{t('review.moments.numberRead')}</Text> : null}
        {moment.outcome ? <Text variant="caption" color="secondary" numberOfLines={1}>{t(`review.moments.outcome.${moment.outcome}`)}</Text> : null}
        <Badge size="sm" variant={EVIDENCE_BADGE[moment.evidence]} label={t(`review.moments.evidence.${moment.evidence}`)} />
      </View>
    </Pressable>
  );
}
