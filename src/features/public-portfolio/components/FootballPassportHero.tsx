import { View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { Avatar } from '@/components/primitives/Avatar';
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
    <View className="overflow-hidden rounded-3xl border-2 border-gold/30 bg-surface">
      <View className="bg-gold-muted px-5 py-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
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

      <View className="gap-4 px-5 py-5">
        <View className="flex-row items-start gap-4">
          <Avatar
            name={profile.fullName}
            source={profile.avatarUrl ? { uri: profile.avatarUrl } : undefined}
            size="2xl"
            showBorder
          />
          <View className="flex-1 gap-2">
            <Text weight="semibold" className="text-2xl">
              {profile.fullName}
            </Text>
            {username ? (
              <Text variant="caption" color="secondary">
                scoutx.app/player/{username}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {profile.position ? <Badge variant="prestige" label={profile.position} /> : null}
              {secondaryPositions.map((position) => (
                <Badge key={position} variant="default" label={position} />
              ))}
              {profile.nationality ? <Badge variant="info" label={profile.nationality} /> : null}
            </View>
          </View>
        </View>

        <View className="gap-2 rounded-2xl border border-border bg-background-secondary/60 p-4">
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
