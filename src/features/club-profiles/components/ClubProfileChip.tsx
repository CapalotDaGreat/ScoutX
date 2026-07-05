import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type ClubProfile } from '@/features/club-profiles/types';

export type ClubProfileChipProps = {
  club: ClubProfile;
};

export function ClubProfileChip({ club }: ClubProfileChipProps) {
  return (
    <View className="rounded-xl border border-border bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <Text variant="caption" color="secondary">
        Club profile
      </Text>
      <Text weight="semibold">{club.name}</Text>
      <Text variant="body-sm" color="secondary">
        {club.league}
        {club.country ? ` · ${club.country}` : ''}
      </Text>
    </View>
  );
}
