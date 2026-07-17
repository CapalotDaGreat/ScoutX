import { View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { useTheme } from '@/theme';

export type FootballPassportHeroProps = {
  data: PublicPortfolioData;
  username?: string | null;
};

export function FootballPassportHero({ data, username }: FootballPassportHeroProps) {
  const { colors } = useTheme();
  const { profile } = data;
  const secondaryPositions = profile.identity.secondaryPositions.slice(0, 2);

  return (
    <View className="overflow-hidden rounded-3xl border-2 border-gold/30 bg-surface">
      <View className="bg-gold-muted px-5 py-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <ShieldCheck size={18} color={colors.gold} />
            <Text weight="semibold" className="text-gold">
              FOOTBALL PASSPORT
            </Text>
          </View>
          <Text variant="caption" className="text-gold">
            ScoutX Verified Identity
          </Text>
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
              <Badge variant="prestige" label={profile.position} />
              {secondaryPositions.map((position) => (
                <Badge key={position} variant="default" label={position} />
              ))}
              <Badge variant="info" label={profile.nationality} />
            </View>
          </View>
        </View>

        <View className="gap-2 rounded-2xl border border-border bg-background-secondary/60 p-4">
          <View className="flex-row flex-wrap gap-x-6 gap-y-2">
            <View>
              <Text variant="caption" color="secondary">
                Club
              </Text>
              <Text weight="semibold">{profile.club}</Text>
            </View>
            <View>
              <Text variant="caption" color="secondary">
                Preferred foot
              </Text>
              <Text weight="semibold">{profile.preferredFoot}</Text>
            </View>
            <View>
              <Text variant="caption" color="secondary">
                Height
              </Text>
              <Text weight="semibold">{profile.height || '—'}</Text>
            </View>
          </View>
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
