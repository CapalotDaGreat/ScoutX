import { View } from 'react-native';
import { type PublicFootballSource } from '@/features/football-sources/core';
import { ExternalFootballSourceCard } from '@/features/football-sources/components/ExternalFootballSourceCard';

export type PublicFootballSourcesListProps = {
  sources: PublicFootballSource[];
  ownerId: string;
  canReport: boolean;
};

/** Read-only links as the server projected them for this audience. */
export function PublicFootballSourcesList({ sources, ownerId, canReport }: PublicFootballSourcesListProps) {
  return (
    <View className="gap-3" testID="public-football-sources">
      {sources.map((source) => (
        <ExternalFootballSourceCard key={source.id} mode="viewer" source={source} ownerId={ownerId} canReport={canReport} />
      ))}
    </View>
  );
}
