import { View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { PlayerIdentityPanel } from '@/components/player-card/PlayerIdentityPanel';
import { Badge } from '@/components/primitives/Badge';
import { StarRating } from '@/components/primitives/StarRating';
import { Text } from '@/components/primitives/Text';
import { ProvenanceBadge } from '@/components/evidence/ProvenanceBadge';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { type TrustVerificationStatus } from '@/features/trust-system/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type FootballPassportHeroProps = {
  data: PublicPortfolioData;
  username?: string | null;
  /**
   * Server-backed verification status. When undefined (still loading) nothing is claimed;
   * when known, the badge states exactly "Verified" or "Unverified".
   */
  verification?: TrustVerificationStatus | null;
};

export function FootballPassportHero({ data, username, verification }: FootballPassportHeroProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['portfolio', 'evidence']);
  const { profile } = data;
  const secondaryPositions = profile.identity.secondaryPositions.slice(0, 2);
  const isVerified = verification?.verified === true;

  return (
    <View className="border-b border-border bg-surface">
      <View className="border-b border-divider px-4 py-3">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="min-w-0 flex-row items-center gap-2">
            <ShieldCheck size={18} color={colors.gold} />
            <Text weight="semibold" className="text-gold">
              {t('portfolio:passportHero.title')}
            </Text>
          </View>
          {verification === undefined ? null : (
            <ProvenanceBadge provenance={isVerified ? 'verified' : 'unverified'} />
          )}
        </View>
      </View>

      <View className="gap-4 px-4 py-5">
        <View className="flex-row flex-wrap items-start gap-4">
          <View className="w-full">
            <PlayerIdentityPanel expanded playerId={data.playerId} name={profile.fullName} portrait={profile.avatarUrl || ''}
              position={[profile.position, ...secondaryPositions].filter(Boolean).join(' / ') || null}
              context={profile.club} facts={profile.nationality} verified={isVerified} />
          </View>
          <View className="min-w-[160px] flex-1 gap-2">
            {username ? (
              <Text variant="caption" color="secondary">
                pitchproof.online/player/{username}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {data.ageGroupLabel === 'youth' ? (
                <Badge variant="default" label={t('portfolio:youthPlayer')} />
              ) : null}
            </View>
          </View>
        </View>

        <View className="gap-3 border-t border-divider pt-4">
          <View className="flex-row flex-wrap gap-x-6 gap-y-2">
            <View>
              <Text variant="caption" color="secondary">
                {t('portfolio:passportHero.club')}
              </Text>
              <Text weight="semibold">{profile.club || '—'}</Text>
            </View>
            <View>
              <Text variant="caption" color="secondary">
                {t('portfolio:passportHero.preferredFoot')}
              </Text>
              <Text weight="semibold">{profile.preferredFoot || '—'}</Text>
            </View>
            <View>
              <Text variant="caption" color="secondary">
                {t('portfolio:passportHero.height')}
              </Text>
              <Text weight="semibold">{profile.height || '—'}</Text>
            </View>
          </View>
          {profile.identity.weakFootRating !== null || profile.identity.skillMovesRating !== null ? (
            <View className="flex-row flex-wrap gap-x-6 gap-y-2">
              <View className="gap-1">
                <Text variant="caption" color="secondary">
                  {t('portfolio:identity.fields.weakFoot')}
                </Text>
                <StarRating
                  value={profile.identity.weakFootRating}
                  label={t('portfolio:identity.fields.weakFoot')}
                  emptyLabel="—"
                />
              </View>
              <View className="gap-1">
                <Text variant="caption" color="secondary">
                  {t('portfolio:identity.fields.skillMoves')}
                </Text>
                <StarRating
                  value={profile.identity.skillMovesRating}
                  label={t('portfolio:identity.fields.skillMoves')}
                  emptyLabel="—"
                />
              </View>
            </View>
          ) : null}
          <Text variant="caption" color="secondary">
            {t('portfolio:passportHero.selfReportedNote')}
          </Text>
          {profile.biography ? (
            <Text variant="body-sm" color="secondary">
              {profile.biography}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
