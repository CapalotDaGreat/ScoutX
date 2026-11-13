import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { ArrowUpRight, Film, CheckCircle2 } from 'lucide-react-native';
import { PlayerIdentityPanel } from '@/components/player-card/PlayerIdentityPanel';
import { cardEvidenceCount, playerInitials } from '@/components/player-card/playerCardPresentation';
import { FreshnessLabel } from '@/components/evidence/FreshnessLabel';
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
  const coverageLabel = player.evidenceCoverage?.consistency
    ? t(`scout:intelligence.coverageState.${player.evidenceCoverage.consistency}`)
    : null;
  const facts = joinKnown([
    player.age !== null ? t('scout:playerDetail.ageYears', { count: player.age }) : null,
    player.nationality || null,
    player.preferredFoot ? t('scout:playerCard.footValue', { foot: t(`scout:filters.${player.preferredFoot}`) }) : null,
  ]);
  return (
    <AnimatedListItem index={index}>
      <View testID={`player-card-${player.id}`} className={cn('overflow-hidden rounded-xl border border-divider bg-surface', className)}>
        <Pressable accessibilityRole="button"
          accessibilityLabel={joinKnown([player.fullName.trim() || playerInitials(player.fullName), player.primaryPosition, player.club || null])}
          accessibilityHint={t('scout:playerCard.openHint')}
          onPress={() => { void triggerHaptic('light'); onPress(player); }}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <View className="gap-3 p-4">
            {player.availability ? <Badge label={t(`scout:filters.${availability[player.availability]}`)}
              variant={player.availability === 'available' ? 'success' : player.availability === 'on_loan' ? 'warning' : 'default'} size="sm" /> : null}
            <PlayerIdentityPanel playerId={player.id} name={player.fullName} portrait={player.avatarUrl || player.coverImageUrl}
              position={joinKnown([player.primaryPosition, ...player.secondaryPositions.slice(0, 2)]) || null}
              context={joinKnown([player.club || null, player.league || null])} facts={facts} verified={player.verified}
              evidenceNote={player.verified
                ? t('scout:playerCard.verifiedEvidenceNote', { defaultValue: 'Trust-verified · logged matches only' })
                : t('scout:playerCard.profileEvidenceNote', { defaultValue: 'Profile fields · analysis count shown only when known' })} />
            {/* Evidence indicators: counts of what exists, never a rating. Unknown stays an em dash. */}
            <View className="flex-row rounded-lg bg-background-secondary px-1 py-3" style={{ backgroundColor: colors.backgroundSecondary }}>
              <View className="min-w-0 flex-1 items-center gap-0.5 px-2">
                <Text className="font-display" style={{ fontSize: 24, lineHeight: 26, fontVariant: ['tabular-nums'] }}>{matches ?? '\u2014'}</Text>
                <Text variant="caption" color="secondary" className="text-center">{t('scout:intelligence.matches')}</Text>
              </View>
              <View className="min-w-0 flex-1 items-center gap-0.5 border-l border-divider px-2">
                <Text className="font-display" style={{ fontSize: 24, lineHeight: 26, fontVariant: ['tabular-nums'] }}>{analyses ?? '\u2014'}</Text>
                <Text variant="caption" color="secondary" className="text-center">{t('scout:playerCard.analysisSamples')}</Text>
              </View>
              <View className="min-w-0 flex-1 items-center gap-1 border-l border-divider px-2">
                <Film size={22} color={player.hasHighlightVideos ? colors.evidence : colors.textTertiary} />
                <Text variant="caption" color="secondary" className="text-center">{t(player.hasHighlightVideos ? 'scout:discover.hasHighlights' : 'scout:playerCard.noHighlights')}</Text>
              </View>
            </View>
            {analyses === null ? (
              <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                <Text variant="caption" color="secondary">
                  {t('scout:playerCard.evidenceFreshness', { defaultValue: 'Evidence freshness' })}
                  {coverageLabel ? `: ${coverageLabel}` : ''}
                </Text>
                <FreshnessLabel updatedAt={player.lastEvidenceAt} sampleSize={player.matchCount} />
              </View>
            ) : null}
            {player.verified ? <View className="flex-row items-center gap-1.5"><CheckCircle2 size={14} color={colors.verification} /><Text variant="caption" color="secondary">{t('trust:verified')}</Text></View> : null}
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
