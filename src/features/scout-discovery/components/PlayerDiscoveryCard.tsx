import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { ArrowUpRight, Film, CheckCircle2 } from 'lucide-react-native';
import { PlayerIdentityPanel } from '@/components/player-card/PlayerIdentityPanel';
import { cardEvidenceCount, playerInitials } from '@/components/player-card/playerCardPresentation';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { AnimatedListItem } from '@/components/feedback/AnimatedListItem';
import { PlayerQuickActions } from './PlayerQuickActions';
import { joinKnown } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export { playerInitials } from '@/components/player-card/playerCardPresentation';
export type PlayerDiscoveryCardProps = {
  player: DiscoverablePlayer;
  onPress: (player: DiscoverablePlayer) => void;
  index?: number;
  className?: string;
  isSaved?: boolean;
  onToggleSave?: (playerId: string) => void;
  saveDisabled?: boolean;
  isInComparison?: boolean;
  canAddToComparison?: boolean;
  onToggleCompare?: (playerId: string) => void;
};
const availability = { available: 'available', unavailable: 'unavailable', on_loan: 'onLoan' } as const;

export const PlayerDiscoveryCard = memo(function PlayerDiscoveryCard({ player, onPress, index = 0, className,
  isSaved = false, onToggleSave, saveDisabled = false, isInComparison = false,
  canAddToComparison = true, onToggleCompare }: PlayerDiscoveryCardProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['scout', 'trust']);
  const matches = cardEvidenceCount(player.matchCount);
  const analyses = cardEvidenceCount(player.analysisSampleCount);
  const facts = joinKnown([
    player.age !== null ? t('scout:playerDetail.ageYears', { count: player.age }) : null,
    player.nationality || null,
    player.preferredFoot ? t('scout:playerCard.footValue', { foot: t(`scout:filters.${player.preferredFoot}`) }) : null,
  ]);
  return (
    <AnimatedListItem index={index}>
      <View testID={`player-card-${player.id}`} className={cn('overflow-hidden rounded-lg border border-border bg-surface', className)}>
        <Pressable accessibilityRole="button"
          accessibilityLabel={joinKnown([player.fullName.trim() || playerInitials(player.fullName), player.primaryPosition, player.club || null])}
          accessibilityHint={t('scout:playerCard.openHint')}
          onPress={() => { void triggerHaptic('light'); onPress(player); }}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-divider bg-background-secondary px-4 py-2.5">
            <Text variant="caption" color="secondary">{t('scout:playerCard.scoutingProfile')}</Text>
            {player.availability ? <Badge label={t(`scout:filters.${availability[player.availability]}`)}
              variant={player.availability === 'available' ? 'success' : player.availability === 'on_loan' ? 'warning' : 'default'} size="sm" /> : null}
          </View>
          <View className="gap-4 p-4">
            <PlayerIdentityPanel playerId={player.id} name={player.fullName} portrait={player.avatarUrl || player.coverImageUrl}
              position={joinKnown([player.primaryPosition, ...player.secondaryPositions.slice(0, 2)]) || null}
              context={joinKnown([player.club || null, player.league || null])} facts={facts} verified={player.verified} />
            <View className="flex-row border-t border-divider pt-3">
              <View className="min-w-0 flex-1 gap-0.5 pr-2">
                <Text variant="body-lg" weight="bold">{matches ?? '\u2014'}</Text>
                <Text variant="caption" color="secondary">{t('scout:intelligence.matches')}</Text>
              </View>
              <View className="min-w-0 flex-1 gap-0.5 border-l border-divider px-3">
                <Text variant="body-lg" weight="bold">{analyses ?? '\u2014'}</Text>
                <Text variant="caption" color="secondary">{t('scout:playerCard.analysisSamples')}</Text>
              </View>
              <View className="min-w-0 flex-1 gap-1 border-l border-divider pl-3">
                <Film size={20} color={player.hasHighlightVideos ? colors.evidence : colors.textTertiary} />
                <Text variant="caption" color="secondary">{t(player.hasHighlightVideos ? 'scout:discover.hasHighlights' : 'scout:playerCard.noHighlights')}</Text>
              </View>
            </View>
            {player.verified ? <View className="flex-row items-center gap-1.5"><CheckCircle2 size={13} color={colors.verification} /><Text variant="caption" color="secondary">{t('trust:verified')}</Text></View> : null}
          </View>
        </Pressable>
        <View className="flex-row items-center justify-between gap-2 border-t border-divider px-4 py-2">
          <Pressable accessibilityRole="button" onPress={() => onPress(player)} className="min-h-[44px] min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text variant="body-sm" weight="semibold" color="accent" className="min-w-0 shrink">{t('scout:playerCard.viewProfile')}</Text>
            <ArrowUpRight size={16} color={colors.accent} />
          </Pressable>
          {onToggleSave || onToggleCompare ? <PlayerQuickActions isFavourite={isSaved} favouriteDisabled={saveDisabled}
            onToggleFavourite={onToggleSave ? () => onToggleSave(player.id) : undefined}
            isInComparison={isInComparison} canAddToComparison={canAddToComparison}
            onToggleCompare={onToggleCompare ? () => onToggleCompare(player.id) : undefined} /> : null}
        </View>
      </View>
    </AnimatedListItem>
  );
});
